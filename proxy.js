const net = require("net");

const PORT = 8080;

const BLACKLIST = ["example.org", "vk.com", "blocked-site.com"];

const server = net.createServer((clientSocket) => {
  let targetSocket = null;
  let isFirstClientChunk = true;

  clientSocket.on("data", (data) => {
    if (isFirstClientChunk) {
      isFirstClientChunk = false;

      const requestString = data.toString("utf-8");

      const firstLineMatch = requestString.match(
        /^([A-Z]+)\s+(http:\/\/[^\s]+)\s+(HTTP\/[0-9.]+)/i,
      );

      if (!firstLineMatch) {
        // const firstLine = requestString.split("\r\n")[0];
        clientSocket.end();
        return;
      }

      const method = firstLineMatch[1];
      const fullUrl = firstLineMatch[2];
      const httpVersion = firstLineMatch[3];

      const parsedUrl = new URL(fullUrl);
      const host = parsedUrl.hostname;
      const port = parsedUrl.port || 80;
      const path = parsedUrl.pathname + parsedUrl.search;

      if (
        BLACKLIST.some(
          (blocked) => fullUrl.includes(blocked) || host.includes(blocked),
        )
      ) {
        const statusCode = 403;
        console.log(`[ЗАБЛОКИРОВАНО] ${method} ${fullUrl} - ${statusCode}`);

        const html = `<html><head><meta charset="utf-8"><title>Доступ запрещен</title></head>
                              <body><h1>${statusCode} Forbidden</h1>
                              <p>Доступ к ресурсу <b>${fullUrl}</b> заблокирован администратором прокси-сервера.</p></body></html>`;

        sendHttpResponse(clientSocket, statusCode, "Forbidden", html);
        return;
      }

      const modifiedRequestString = requestString.replace(
        firstLineMatch[0],
        `${method} ${path} ${httpVersion}`,
      );

      targetSocket = net.connect({ host: host, port: port }, () => {
        targetSocket.write(modifiedRequestString);
      });

      let isFirstServerChunk = true;

      targetSocket.on("data", (serverData) => {
        if (isFirstServerChunk) {
          isFirstServerChunk = false;
          const responseString = serverData.toString("utf-8");

          const statusMatch = responseString.match(/^HTTP\/[0-9.]+\s+(\d{3})/);
          const statusCode = statusMatch ? statusMatch[1] : "???";

          console.log(`[ЖУРНАЛ] ${fullUrl} - ${statusCode}`);
        }

        clientSocket.write(serverData);
      });

      targetSocket.on("end", () => clientSocket.end());
      targetSocket.on("error", () => clientSocket.end());
    } else {
      if (targetSocket && !targetSocket.destroyed) {
        targetSocket.write(data);
      }
    }
  });

  clientSocket.on("error", (err) => {
  });
});

server.listen(PORT, () => {
  console.log(`Прокси-сервер запущен на 127.0.0.1:${PORT}`);
  console.log(`Фильтр (Черный список): ${BLACKLIST.join(", ")}`);
});



function sendHttpResponse(socket, statusCode, statusText, htmlBody) {
  const response = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Length: ${Buffer.byteLength(htmlBody)}`,
    `Connection: close`,
    ``, 
    htmlBody
  ].join('\r\n');

  socket.write(response);
  socket.end();
}

