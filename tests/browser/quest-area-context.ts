import { createContext, useContext } from 'react';
export const AreaContext = createContext<any>(null);
export const useQuestboard = () => useContext(AreaContext);
