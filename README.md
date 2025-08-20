# 📚 SmartStudentAct App 
SmartStudentAct is a modern, mobile-ready web application designed to help students manage assignments, budgets, and goals — while enabling teachers to assign tasks and track progress. Built with Node.js and SQLite, it features real-time task reminders, financial tools, and a reward system to keep students motivated.

---

## 🌟 Features

### 🎓 Student Dashboard
- Add and track assignments
- Automatic reminders 24 hours and 2 hours before due time
- Budget tracking (expenses and saving goals)
- Weekly goal setting
- Reward and achievement tracker
- Email & SMS notifications for upcoming tasks

### 👩‍🏫 Teacher Dashboard
- Assign tasks to students
- View students by alphabetical order
- Reminder notifications and assignment history
- Modal confirmation for task submission

### 🔒 Authentication
- Signup/login with session protection
- Route restriction for unauthorized users
- Occupation-based redirection (students vs. teachers)

---

## 🛠️ Tech Stack

| Layer         | Technology       |
| ------------- | ---------------- |
| **Frontend**  | HTML, CSS, JavaScript |
| **Backend**   | Node.js, Express |
| **Database**  | SQLite (can be switched to PostgreSQL or MongoDB) |
| **APIs**      | Email & SMS push (via nodemailer / SMS gateway) |
| **Deployment**| [Render](https://render.com) / Android WebView (via Android Studio) |

---

## 🚀 Getting Started

### 🔧 Prerequisites

- Node.js & npm
- Git
- SQLite (MongoDB)

### 📦 Installation

```bash
git clone https://github.com/debuck1718/smartstudent.git
cd smartstudent
npm install
🤝 Contributing
Fork the repo

Create your branch (git checkout -b feature-name)

Commit your changes (git commit -am 'Add feature')

Push to the branch (git push origin feature-name)

Open a Pull Request

🧠 Author
Evans Buckman
🔐 Security Analyst & Developer
🌍 Accra, Ghana
📂 Portfolio
📧 evans.buckman55@gmail.com

📜 License
This project is licensed under the MIT License.

🔗 Project Status
✅ Frontend built and tested
✅ Backend routes and reminder logic completed
✅ Android Studio WebView setup done
🟡 Deployment in progress