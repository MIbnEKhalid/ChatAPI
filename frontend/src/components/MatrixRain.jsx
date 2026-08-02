import { useEffect, useRef } from 'react'

export default function MatrixRain({ enabled = true }) {
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン'
    const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const nums = '0123456789'
    const alphabet = katakana + latin + nums
    const fontSize = 18

    function initMatrix() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const columns = Math.floor(canvas.width / fontSize)
      const drops = Array(columns).fill(1)

      if (intervalRef.current) clearInterval(intervalRef.current)

      intervalRef.current = setInterval(() => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#0F0'
        ctx.font = `${fontSize}px monospace`

        for (let i = 0; i < drops.length; i++) {
          const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length))
          ctx.fillText(text, i * fontSize, drops[i] * fontSize)
          if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            drops[i] = 0
          }
          drops[i]++
        }
      }, 30)
    }

    if (enabled) {
      initMatrix()
    }

    const handleResize = () => {
      if (enabled) initMatrix()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [enabled])

  return <canvas ref={canvasRef} id="matrix-canvas" style={{ display: enabled ? 'block' : 'none' }} />
}
