# Deployment Notes

- Front end can be deployed to Vercel, Netlify, or static hosting behind Nginx.
- Back end can be deployed to Render, Fly.io, Railway, or a VPS.
- DNS should route the public site and API hostname intentionally.
- Logs, health endpoints, and environment variables should be verified after each deploy.
- A reverse proxy is useful when the API is hosted on the same Linux machine as the public site.
