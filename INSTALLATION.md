# Productivity Tracker - Installation Guide

This guide will help you set up the Productivity Tracker Chrome extension with its MERN stack backend.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16.0.0 or higher)
- **npm** (v8.0.0 or higher)
- **MongoDB** (v4.4 or higher)
- **Git**
- **Google Chrome** browser

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/productivity-tracker.git
cd productivity-tracker
```

### 2. Install Dependencies

```bash
# Install all dependencies for backend and dashboard
npm run setup
```

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your configuration:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/productivity-tracker
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
```

### 4. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Ubuntu/Debian
sudo systemctl start mongod

# On Windows
net start MongoDB
```

### 5. Start the Backend Server

```bash
npm run start-backend
```

The backend API will be available at `http://localhost:5000`

### 6. Install the Chrome Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `extension` folder from this project
6. The extension should now appear in your Chrome toolbar

## Detailed Setup

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file:**
   - Set your MongoDB connection string
   - Generate secure JWT secrets
   - Configure other settings as needed

5. **Start the development server:**
   ```bash
   npm run dev
   ```

### Extension Setup

1. **Load the extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder

2. **Configure the extension:**
   - Click on the extension icon in the toolbar
   - Go to Settings and set the API endpoint to `http://localhost:5000/api`
   - Create an account or log in

### Database Setup

1. **Start MongoDB:**
   ```bash
   # Make sure MongoDB is running
   mongod
   ```

2. **Create database (optional):**
   The application will automatically create the database and collections when you first run it.

## Features Configuration

### Time Tracking
- Automatically tracks time spent on websites
- Categorizes websites (Work, Social Media, Entertainment, etc.)
- Calculates productivity scores

### Website Blocking
- Block distracting websites during focus sessions
- Customizable blocked site lists
- Override functionality with delay

### Focus Sessions
- Pomodoro-style focus sessions
- Customizable duration (15, 25, 30, 45, 60 minutes)
- Progress tracking and statistics

### Data Synchronization
- Sync data across devices using the backend API
- Real-time updates and backup
- Export/import functionality

## API Endpoints

The backend provides the following main endpoints:

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/sync` - Sync extension data
- `GET /api/tracking/today` - Get today's tracking data
- `GET /api/reports/daily/:date` - Get daily reports
- `GET /api/users/blocked-sites` - Get blocked sites

## Development

### Running in Development Mode

```bash
# Start backend in development mode
npm run start-backend

# The extension will automatically connect to localhost:5000
```

### Building for Production

```bash
# Build the extension package
npm run extension:build

# This creates a productivity-tracker-extension.zip file
```

### Testing

```bash
# Run backend tests
npm run test-backend

# Run linting
npm run lint
```

## Troubleshooting

### Common Issues

1. **Extension not loading:**
   - Make sure you're in Developer mode in Chrome
   - Check the console for any JavaScript errors
   - Verify all files are present in the extension folder

2. **Backend connection issues:**
   - Ensure the backend server is running on port 5000
   - Check that MongoDB is running
   - Verify the API endpoint in extension settings

3. **Data not syncing:**
   - Check your internet connection
   - Verify you're logged in to the extension
   - Check the backend logs for any errors

4. **MongoDB connection errors:**
   - Ensure MongoDB is installed and running
   - Check the MONGODB_URI in your .env file
   - Verify database permissions

### Logs and Debugging

- **Backend logs:** Check the terminal where you started the backend server
- **Extension logs:** Open Chrome DevTools → Console while on any webpage
- **Extension popup logs:** Right-click the extension icon → Inspect popup

## Security Considerations

### For Development
- Use strong JWT secrets
- Don't commit `.env` files to version control
- Use HTTPS in production

### For Production
- Set `NODE_ENV=production`
- Use environment variables for all secrets
- Enable CORS only for your domain
- Use a secure MongoDB connection
- Implement rate limiting (already included)

## Browser Compatibility

- **Chrome:** Fully supported (Manifest V3)
- **Edge:** Should work with minor modifications
- **Firefox:** Requires manifest conversion for Manifest V2

## Performance Tips

1. **Database Optimization:**
   - Ensure proper indexing (already configured)
   - Regular database maintenance
   - Consider MongoDB Atlas for production

2. **Extension Performance:**
   - The extension is optimized for minimal resource usage
   - Data is cached locally to reduce API calls
   - Background processing is throttled

## Support

If you encounter any issues:

1. Check this installation guide
2. Review the troubleshooting section
3. Check the project's GitHub issues
4. Create a new issue with detailed information

## Next Steps

After installation:

1. **Configure your preferences** in the extension options
2. **Add websites to block** for better focus
3. **Start your first focus session**
4. **Review your daily reports** to track progress
5. **Customize categories** for better organization

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.