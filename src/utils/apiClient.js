import { api as restApi } from './api';

const isElectron = typeof window !== 'undefined' && window.api;

export const apiClient = isElectron ? window.api : restApi;
export { isElectron };
