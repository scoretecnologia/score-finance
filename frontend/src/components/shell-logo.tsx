import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface ShellLogoProps {
  size?: number
  className?: string
}

export function ShellLogo({ size = 24, className }: ShellLogoProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div style={{ width: size, height: size }} className={className} />
  }

  const currentTheme = theme === 'system' ? resolvedTheme : theme
  const logoSrc = currentTheme === 'dark' ? '/logo-dark.png' : '/logo-light.png'

  return (
    <img 
      src={logoSrc} 
      width={size} 
      height={size} 
      className={className} 
      alt="Score Finance" 
      style={{ objectFit: 'contain' }}
    />
  )
}
