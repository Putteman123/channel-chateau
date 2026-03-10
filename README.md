# Streamify - Modern IPTV Streaming Application

![Streamify Logo](https://img.shields.io/badge/Streamify-IPTV%20Streaming-6366f1?style=for-the-badge&logo=play&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Expo](https://img.shields.io/badge/Expo-SDK%2053-000020?style=for-the-badge&logo=expo)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb)

**Streamify** är en modern, fullstack IPTV-streamingapplikation byggd med Expo (React Native) och FastAPI. Den stöder obegränsat stort innehåll, flera playlists, och avancerad videostreaming med HLS.js proxy-lösning för CORS-bypass.

## 🌟 Huvudfunktioner

### 📱 Cross-Platform Support
- **iOS & Android**: Native mobilappar via Expo
- **Web**: Responsiv webbapp med HLS.js för optimal streaming
- **Expo Go**: Direkttestning under utveckling

### 🎥 Avancerad Videostreaming
- **Video.js Integration**: Professionell video-spelare med inbyggda kontroller
- **HLS HTTP Streaming**: Inbyggt stöd för HLS (HTTP Live Streaming)
- **Video Proxy**: Backend-proxy för CORS-bypass (`/api/proxy/stream`, `/api/proxy/m3u8`)
- **Adaptiv Bitrate**: Automatisk kvalitetsjustering
- **Auto-Recovery**: Hanterar nätverksavbrott automatiskt
- **Multiple Formats**: Stöd för M3U8, MP4, TS och fler format
- **Rich Controls**: Play/pause, volym, fullscreen, timeline scrubbing

### 📺 Innehållshantering
- **Unlimited Scaling**: Hanterar hundratusentals kanaler, filmer och serier
- **Multiple Playlist Support**: 
  - M3U URL import
  - M3U File upload
  - Xtream Codes API integration
- **Smart Categorization**: Automatisk separation i TV, Movies, Series
- **Search & Filter**: Kraftfull sök- och filtreringsfunktionalitet
- **Favorites System**: Användarspecifika favoriter

### 🛡️ Admin Panel
- **Real-time Statistics**: Dashboard med live-statistik
- **User Management**: Hantera användare och behörigheter
- **Content Overview**: Översikt av allt innehåll
- **Quick Actions**: Snabbåtgärder för vanliga uppgifter

### 🎨 Modern UI/UX
- **Auto Light/Dark Theme**: Automatiskt anpassning efter systempreferenser
- **Modern Color Palette**: Indigo/Cyan/Purple färgschema
- **Smooth Animations**: Flytande övergångar och animationer
- **Touch-Optimized**: Thumb-friendly navigation för mobil

## 🏗️ Teknisk Arkitektur

### Frontend Stack
```
Expo SDK 53 (React Native)
├── Expo Router (File-based routing)
├── Tamagui (UI Components)
├── Zustand (State Management)
├── Axios (API Client)
├── Video.js (Web Video Streaming)
├── @videojs/http-streaming (HLS Support)
├── expo-av (Native Video Playback)
└── React Native Reanimated (Animations)
```

### Backend Stack
```
FastAPI (Python)
├── Motor (Async MongoDB Driver)
├── Pydantic (Data Validation)
├── JWT (Authentication)
├── aiohttp (HTTP Client for Proxy)
└── python-multipart (File Uploads)
```

### Database Schema
```
MongoDB
├── users (Authentication & User Data)
├── playlists (Playlist Metadata)
├── channels (Content Items - Linked by playlist_id)
└── favorites (User Favorites)
```

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+ & Yarn
- Python 3.11+
- MongoDB 7.0+
- Expo CLI

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB connection string

# Start backend server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env with your backend API URL

# Start Expo development server
yarn start

# Run on specific platform
yarn ios      # iOS Simulator
yarn android  # Android Emulator
yarn web      # Web Browser
```

### Environment Variables

#### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017/streamify
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

#### Frontend (.env)
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

## 📖 API Documentation

### Authentication Endpoints
```
POST /api/auth/register     - Register new user
POST /api/auth/login        - Login user
GET  /api/auth/me           - Get current user
```

### Playlist Endpoints
```
GET    /api/playlists                           - List user's playlists
POST   /api/playlists                           - Add M3U URL playlist
POST   /api/playlists/file                      - Upload M3U file
POST   /api/playlists/xtream                    - Add Xtream Codes playlist
DELETE /api/playlists/{playlist_id}             - Delete playlist
GET    /api/playlists/{playlist_id}/channels    - Get channels (paginated)
```

### Content Endpoints
```
GET /api/playlists/{playlist_id}/channels?content_type=live&limit=50  - TV Channels
GET /api/playlists/{playlist_id}/movies?limit=30                      - Movies
GET /api/playlists/{playlist_id}/series?limit=30                      - Series
```

### Video Proxy Endpoints
```
GET /api/proxy/stream?url={base64_url}  - Proxy video stream
GET /api/proxy/m3u8?url={base64_url}    - Proxy M3U8 playlist
```

### Favorites Endpoints
```
GET    /api/favorites?content_type={type}  - Get user's favorites
POST   /api/favorites                      - Add to favorites
DELETE /api/favorites/{favorite_id}        - Remove from favorites
```

## 🎯 Key Features Explained

### Large-Scale Content Handling
Streamify använder en skalbar arkitektur som separerar innehåll från playlists:
- Playlists innehåller endast metadata
- Innehåll (channels, movies, series) lagras separat med `playlist_id` referens
- Detta kringgår MongoDBs 16MB dokument-limit
- Stöder 300,000+ items per playlist

### Video Proxy System
För att hantera CORS-begränsningar i webbläsare:
1. Frontend detekterar web-plattform
2. URLs konverteras till Base64
3. Backend proxar requests server-side
4. Content streamar tillbaka till klient
5. Native appar använder direkta URLs (ingen proxy behövs)

### Background Processing
För stora playlists:
- Initial request returnerar omedelbart med `status: 'loading'`
- Parsing sker i bakgrunden
- Frontend pollar status tills `status: 'ready'`
- Detta förhindrar request timeouts

## 🔒 Security Best Practices

- JWT-baserad authentication
- Password hashing med bcrypt
- Environment variables för känslig data
- Input validation med Pydantic
- CORS konfiguration
- Rate limiting (rekommenderas för produktion)

## 📱 Mobile App Features

### iOS Specifikt
- Native video player med full-screen support
- Background audio playback
- AirPlay integration möjlig

### Android Specifikt
- Picture-in-Picture mode
- Chromecast support möjlig
- Android TV optimering möjlig

## 🌐 Web App Features

- Progressive Web App (PWA) ready
- Responsive design
- HLS.js för optimal streaming
- Keyboard shortcuts
- Desktop optimizations

## 🛠️ Development

### Project Structure
```
streamify/
├── frontend/              # Expo React Native App
│   ├── app/              # Expo Router (File-based routing)
│   │   ├── (tabs)/       # Tab navigation screens
│   │   ├── auth/         # Authentication screens
│   │   └── player.tsx    # Video player
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   ├── services/     # API services
│   │   └── theme/        # Theme configuration
│   └── assets/           # Images, fonts, etc.
├── backend/              # FastAPI Server
│   ├── server.py         # Main application file
│   └── requirements.txt  # Python dependencies
└── README.md            # This file
```

### Running Tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
yarn test
```

### Building for Production

#### Web
```bash
cd frontend
expo export:web
```

#### iOS (Requires Mac)
```bash
cd frontend
eas build --platform ios
```

#### Android
```bash
cd frontend
eas build --platform android
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Expo Team** - For the amazing React Native framework
- **FastAPI** - For the blazing-fast Python backend
- **HLS.js** - For professional video streaming
- **MongoDB** - For flexible data storage

## 📞 Support

For support, email support@streamify.app or open an issue on GitHub.

## 🗺️ Roadmap

- [ ] EPG (Electronic Program Guide) integration
- [ ] Multi-user profiles
- [ ] Parental controls
- [ ] Download for offline viewing
- [ ] Social features (watch parties)
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Recommendation engine

## 📊 Project Stats

- **Total Lines of Code**: 10,000+
- **Languages**: TypeScript, Python, JavaScript
- **Platforms**: iOS, Android, Web
- **Database**: MongoDB with async Motor driver
- **API Routes**: 15+ endpoints
- **UI Components**: 50+ custom components

---

**Built with ❤️ for the streaming community**

*Streamify - Din ultimata streaming-upplevelse*
