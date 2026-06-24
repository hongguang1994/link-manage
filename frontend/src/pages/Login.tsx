import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { loginApi, getCaptchaApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true)
    setCaptchaCode('')
    try {
      const res = await getCaptchaApi()
      setCaptchaToken(res.data.token)
      setCaptchaSvg(res.data.svg)
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  useEffect(() => { loadCaptcha() }, [loadCaptcha])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!captchaCode.trim()) {
      setError(t('login_captcha_required'))
      return
    }
    setLoading(true)
    try {
      const res = await loginApi(username, password, captchaToken, captchaCode)
      setAuth(res.data.access_token, res.data.user)
      navigate('/')
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('login_error_default')
      setError(detail)
      // Refresh captcha on any error
      loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SimNexus</h1>
          <p className="text-gray-400 text-sm mt-1">{t('login_subtitle')}</p>
        </div>

        <form onSubmit={submit} className="bg-gray-800 rounded-2xl border border-gray-700 p-6 space-y-4">
          {/* Username */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('login_username')}</label>
            <input
              type="text" value={username}
              onChange={e => setUsername(e.target.value)}
              required autoFocus className={inputCls}
              placeholder={t('login_username_ph')}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('login_password')}</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                required className={`${inputCls} pr-10`}
                placeholder={t('login_password_ph')}
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Captcha */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">{t('login_captcha')}</label>
            <div className="flex items-center gap-2">
              {/* SVG image */}
              <div
                className="flex-shrink-0 rounded-md overflow-hidden border border-gray-600 cursor-pointer"
                title={t('login_captcha_refresh')}
                onClick={loadCaptcha}
                dangerouslySetInnerHTML={{ __html: captchaSvg }}
              />
              {/* Refresh button */}
              <button
                type="button" onClick={loadCaptcha} disabled={captchaLoading}
                className="flex-shrink-0 p-2 text-gray-500 hover:text-gray-300 transition-colors"
                title={t('login_captcha_refresh')}
              >
                <RefreshCw className={`w-4 h-4 ${captchaLoading ? 'animate-spin' : ''}`} />
              </button>
              {/* Input */}
              <input
                type="text" value={captchaCode}
                onChange={e => setCaptchaCode(e.target.value)}
                maxLength={4}
                placeholder={t('login_captcha_ph')}
                className={`${inputCls} tracking-[0.3em] uppercase font-mono`}
                autoComplete="off"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? t('login_loading') : t('login_submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
