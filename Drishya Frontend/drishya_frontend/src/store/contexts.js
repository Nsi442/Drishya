// Context objects live apart from the provider component so that neither this
// file nor the hooks file mixes component and non-component exports — that
// mix is what breaks Fast Refresh.

import { createContext } from 'react'

export const StateContext = createContext(null)
export const DispatchContext = createContext(null)
