import { createContext, useContext, useState, useEffect } from 'react'
import { fetchSites, setSiteId as setClientSiteId } from '../api/client'

const SiteCtx = createContext({ activeSite: null, sites: [], setSite: () => {} })

export function SiteProvider({ children }) {
  const [sites, setSites]           = useState([])
  const [activeSite, setActiveSite] = useState(
    () => localStorage.getItem('activeSite') || null,
  )

  useEffect(() => {
    fetchSites()
      .then(data => {
        setSites(data)
        setActiveSite(prev => {
          const valid = prev && data.find(s => s.id === prev) ? prev : data[0]?.id ?? null
          if (valid) {
            localStorage.setItem('activeSite', valid)
            setClientSiteId(valid)
          }
          return valid
        })
      })
      .catch(() => {})
  }, [])

  function setSite(id) {
    setActiveSite(id)
    localStorage.setItem('activeSite', id)
    setClientSiteId(id)
  }

  return (
    <SiteCtx.Provider value={{ activeSite, sites, setSite }}>
      {children}
    </SiteCtx.Provider>
  )
}

export const useSite = () => useContext(SiteCtx)
