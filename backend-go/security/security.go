package security

import (
	"time"

	"simnexus-go/config"
	"simnexus-go/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const accessTokenExpireMinutes = 60 * 24 // 24h

// HashPassword returns a bcrypt hash of the password.
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

// Perm mirrors Python _perm(): merged permission set from RBAC roles.
// Returns nil if the (non-admin) user has no roles.
type Permissions struct {
	CanViewSim         bool
	CanApproveRequests bool
	CanViewHistory     bool
	CanSupport         bool
	ReadOnly           bool
	// AllowedModemIDs: nil means unrestricted; otherwise the restricted set.
	AllowedModemIDs []uint
	unrestricted    bool // true when AllowedModemIDs is intentionally None
}

// Perm computes the merged permissions for a user. Admin returns full access.
func Perm(u *models.User) *Permissions {
	if u.Role == models.RoleAdmin {
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
	if u.Role == models.RoleAdmin {
		return true
	}
	for _, r := range u.RbacRoles {
		if r.CanSupport {
			return true
		}
	}
	return false
}

// GetUserModemGrants returns the modem IDs a user can access.
// level = "" (any) or "use". Role auto-grants are computed from u.RbacRoles.
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

// ContainsUint reports membership.
func ContainsUint(s []uint, v uint) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
