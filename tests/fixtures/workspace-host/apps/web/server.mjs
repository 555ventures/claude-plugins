// Workspace-shaped fixture host's web app: listens on process.env.PORT, answers one fixed body.
import http from 'node:http'

const port = Number(process.env.PORT)
http.createServer((req, res) => {
  res.statusCode = 200
  res.end('workspace-host ok')
}).listen(port, '127.0.0.1')
