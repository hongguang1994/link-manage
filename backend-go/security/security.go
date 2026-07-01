package security

import (
	"time"

	"simnexus-go/config"
	"simnexus-go/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// accessTokenExpireMinutes JWT 令牌有效期（24 小时）。
const accessTokenExpireMinutes = 60 * 24 // 24h

// HashPassword 使用 bcrypt 对密码进行散列，返回可直接存储的字符串。
func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

// VerifyPassword checks a plaintext password against a bcrypt hash.
func VerifyPassword(plain, hashed string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashed), []byte(plain)) == nil
}

// CreateAccessToken issues a JWT with `sub` = username.
func CreateAccessToken(username string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"exp": time.Now().Add(accessTokenExpireMinutes * time.Minute).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(config.SecretKey))
}

// ParseToken validates a JWT and returns the `sub` claim (username).
func ParseToken(tokenStr string) (string, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.SecretKey), nil
	})
	if err != nil || !tok.Valid {
		if err == nil {
			err = jwt.ErrTokenInvalidClaims
		}
		return "", err
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return "", jwt.ErrTokenInvalidClaims
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", jwt.ErrTokenInvalidClaims
	}
	return sub, nil
}

// LoadUserByUsername loads an active user with RBAC roles (and their modem scope) joined.
func LoadUserByUsername(db *gorm.DB, username string) (*models.User, error) {
	var u models.User
	err := db.Preload("RbacRoles").Preload("RbacRoles.ModemScope").
		Where("username = ? AND is_active = ?", username, true).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// Permissions 是用户合并后的有效权限集，镜像 Python 的 _perm() 返回值。
// AllowedModemIDs=nil 且 unrestricted=true 表示不限设备范围。
type Permissions struct {
	CanViewSim         bool
	CanApproveRequests bool
	CanViewHistory     bool
	CanSupport         bool
	ReadOnly           bool
	// AllowedModemIDs: nil 表示无限制；非 nil 为受限设备 ID 集合。
	AllowedModemIDs []uint
	unrestricted    bool // 内部标记：true 时 AllowedModemIDs 语义上为 nil（无限制）
}

// Perm 计算用户的合并权限。管理员返回全权限；无 RBAC 角色的用户返回 nil。
// 正向权限标志取所有角色的并集（any），ReadOnly 取交集（all）。
func Perm(u *models.User) *Permissions {
	if u.IsAdmin() {
		return &Permissions{
			CanViewSim: true, CanApproveRequests: true, CanViewHistory: true,
			CanSupport: true, ReadOnly: false, unrestricted: true,
		}
	}
	roles := u.RbacRoles
	if len(roles) == 0 {
		return nil
	}

	p := &Permissions{ReadOnly: true}
	// positive flags = any; read_only = all
	for _, r := range roles {
		p.CanViewSim = p.CanViewSim || r.CanViewSim
		p.CanApproveRequests = p.CanApproveRequests || r.CanApproveRequests
		p.CanViewHistory = p.CanViewHistory || r.CanViewHistory
		p.CanSupport = p.CanSupport || r.CanSupport
		if !r.ReadOnly {
			p.ReadOnly = false
		}
	}

	// modem scope: only approver roles matter
	var approverRoles []models.Role
	for _, r := range roles {
		if r.CanApproveRequests {
			approverRoles = append(approverRoles, r)
		}
	}
	if len(approverRoles) > 0 {
		anyEmpty := false
		set := map[uint]struct{}{}
		for _, r := range approverRoles {
			if len(r.ModemScope) == 0 {
				anyEmpty = true
			}
			for _, m := range r.ModemScope {
				set[m.ID] = struct{}{}
			}
		}
		if anyEmpty || len(set) == 0 {
			p.unrestricted = true
		} else {
			for id := range set {
				p.AllowedModemIDs = append(p.AllowedModemIDs, id)
			}
		}
	} else {
		p.unrestricted = true
	}
	return p
}

// IsUnrestrictedScope reports whether the permission scope is unrestricted (None in Python).
func (p *Permissions) IsUnrestrictedScope() bool { return p == nil || p.unrestricted }

// IsSupportStaff reports whether the user is admin or has a can_support role.
func IsSupportStaff(u *models.User) bool {
	if u.IsAdmin() {
		return true
	}
	for _, r := range u.RbacRoles {
		if r.CanSupport {
			return true
		}
	}
	return false
}

// GetUserModemGrants 返回用户可访问的设备 ID 集合。
// level="" 表示任意权限级别，level="use" 仅返回可发送短信的设备。
// 审批员角色在其管辖范围内自动获得 use 级别授权（无需申请）。
func GetUserModemGrants(db *gorm.DB, userID uint, level string, u *models.User) []uint {
	now := time.Now().UTC()
	q := db.Model(&models.SimGrant{}).
		Where("user_id = ? AND (expires_at IS NULL OR expires_at > ?)", userID, now)
	if level == models.LevelUse {
		q = q.Where("granted_level = ?", models.LevelUse)
	}
	var grants []models.SimGrant
	q.Find(&grants)

	set := map[uint]struct{}{}
	for _, g := range grants {
		set[g.ModemID] = struct{}{}
	}

	if u != nil {
		for _, role := range u.RbacRoles {
			scopeIDs := make([]uint, 0, len(role.ModemScope))
			for _, m := range role.ModemScope {
				scopeIDs = append(scopeIDs, m.ID)
			}
			if role.CanApproveRequests {
				if len(scopeIDs) == 0 {
					// unrestricted approver → all modems
					var all []models.Modem
					db.Select("id").Find(&all)
					for _, m := range all {
						set[m.ID] = struct{}{}
					}
				} else {
					for _, id := range scopeIDs {
						set[id] = struct{}{}
					}
				}
			} else if len(scopeIDs) > 0 {
				for _, id := range scopeIDs {
					set[id] = struct{}{}
				}
			}
		}
	}

	out := make([]uint, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	return out
}

// ContainsUint 判断 uint 切片中是否包含指定值。
func ContainsUint(s []uint, v uint) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
