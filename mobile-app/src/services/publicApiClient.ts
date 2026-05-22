import axios from 'axios';

const PUBLIC_API_BASE = 'http://localhost:3000/api/public';

const publicApiClient = axios.create({
  baseURL: PUBLIC_API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export default publicApiClient;
