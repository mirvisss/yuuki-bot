const http = require('http');

// Render (и подобные PaaS) засыпают бесплатные сервисы после ~15 минут без
// входящих HTTP-запросов. Здесь мы поднимаем мини healthcheck-сервер на
// process.env.PORT (Render задаёт его сам) и раз в 5 минут дёргаем собственный
// публичный адрес, чтобы сервис не уходил в сон, пока процесс жив.
// Если сервис всё-таки уснул, разбудить его может только внешний пинг —
// это делает workflow .github/workflows/keepalive.yml раз в 10 минут.
module.exports = function keepAlive() {
  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Yuuki is running');
  });

  server.listen(port, () => {
    console.log(`[keepAlive] health server listening on :${port}`);
  });

  // RENDER_EXTERNAL_URL Render подставляет автоматически — настраивать нечего.
  // KEEPALIVE_URL — на случай другого хостинга.
  const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.KEEPALIVE_URL;
  if (!publicUrl) return;

  const target = `${publicUrl.replace(/\/+$/, '')}/`;
  const ping = () => {
    const req = http.get(target, (res) => res.resume());
    req.on('error', () => {});
    req.setTimeout(20000, () => req.destroy());
  };

  setInterval(ping, 5 * 60 * 1000).unref();
  console.log(`[keepAlive] self-ping every 5 min: ${target}`);
};
