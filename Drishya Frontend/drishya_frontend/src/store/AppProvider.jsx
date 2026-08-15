import { useReducer, useEffect } from 'react'
import { StateContext, DispatchContext } from './contexts.js'
import { rootReducer, initialState } from './reducer.js'

export default function AppProvider({ children }) {
  const [state, dispatch] = useReducer(rootReducer, initialState)

  // The theme is the one piece of state that has to escape React and land on
  // the document, because the tokens are defined against [data-theme].
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.ui.theme)
  }, [state.ui.theme])

  useEffect(() => {
    document.documentElement.lang = state.ui.language
  }, [state.ui.language])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}
