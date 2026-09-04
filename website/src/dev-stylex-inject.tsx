import { useEffect } from 'react'

function DevStyleXInjectImpl() {
  useEffect(() => {
    void import('virtual:stylex:runtime')
  }, [])

  return <link rel="stylesheet" href="/virtual:stylex.css" />
}

export function DevStyleXInject() {
  return import.meta.env.DEV ? <DevStyleXInjectImpl /> : null
}
