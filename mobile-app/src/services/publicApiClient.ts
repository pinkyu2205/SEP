import axios from 'axios';
import { API_CONFIG } from '../constants/api';

const publicApiClient = axios.create({
  baseURL: API_CONFIG.PUBLIC_BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

export default publicApiClient;
