const http = require('http');

// Render (и подобные PaaS) засыпают бесплатные сервисы без входящих HTTP-запросов.
// Запускаем мини healthcheck-сервер на process.env.PORT, когда задан (облако),
// и пингаем его UptimeRobot каждые 5 минут — сервис не уходит в сон.
module.exports = function keepAlive() {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Yuuki is running');
  });
  server.listen(port, () => {
    console.log(`[keepAlive] health server listening on :${port}`);
  });
};
