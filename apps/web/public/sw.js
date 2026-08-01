self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : { title: "Family Hub", body: "New family message" };
  event.waitUntil(
    self.registration.showNotification(data.title || "Family Hub", {
      body: data.body || "New message",
      icon: "/icon-192.png"
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/family"));
});
