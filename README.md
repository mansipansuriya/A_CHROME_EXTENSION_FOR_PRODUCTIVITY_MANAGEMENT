# Productivity Tracker Chrome Extension

A comprehensive Chrome extension that helps users track their productivity by monitoring website usage, blocking distracting sites, and providing detailed reports.

## Features

- **Time Tracking**: Monitor time spent on different websites
- **Website Blocking**: Block distracting websites during focus sessions
- **Daily Reports**: Generate comprehensive productivity reports
- **Cross-Device Sync**: Sync data across multiple devices
- **User Preferences**: Customizable settings and blocked site lists

## Tech Stack

### Frontend (Chrome Extension)
- Vanilla JavaScript
- HTML5/CSS3
- Chrome Extension APIs

### Backend (MERN Stack)
- **MongoDB**: Database for storing user data and analytics
- **Express.js**: RESTful API server
- **React.js**: Admin dashboard (optional)
- **Node.js**: Runtime environment

## Project Structure

```
productivity-tracker/
├── extension/              # Chrome extension files
│   ├── manifest.json
│   ├── popup/
│   ├── background/
│   ├── content/
│   └── options/
├── backend/               # MERN stack backend
│   ├── server.js
│   ├── models/
│   ├── routes/
│   └── middleware/
└── dashboard/            # React admin dashboard
    ├── src/
    └── public/
```

## Installation

1. Clone the repository
2. Install backend dependencies: `cd backend && npm install`
3. Install dashboard dependencies: `cd dashboard && npm install`
4. Load the extension in Chrome developer mode
5. Configure your MongoDB connection
6. Start the backend server: `npm start`

## Usage

1. Install the extension in Chrome
2. Configure your productivity goals and blocked sites
3. Start tracking your website usage
4. View daily/weekly reports in the popup or dashboard