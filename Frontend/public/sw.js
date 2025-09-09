// sw.js (Service Worker)

// Listen for incoming push messages
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    data = { title: "Smart Student Reminder", body: event.data.text() };
  }

  const title = data.title || "Smart Student Reminder";
  const options = {
    body: data.body || "You have a task coming up!",
    icon: "/images/notification-icon.png",   // notification icon
    badge: "/images/notification-badge.png", // small badge icon
    data: { url: data.url || "/students.html" }, // pass URL for click handling
  };

  event.waitUntil(self.registration.showNotification(title, options));
});


self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/students.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

