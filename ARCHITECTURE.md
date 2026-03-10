# Streamify Architecture

This document provides a detailed overview of Streamify's architecture, design decisions, and technical implementation.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Design](#database-design)
6. [Video Streaming Architecture](#video-streaming-architecture)
7. [Scalability](#scalability)
8. [Security](#security)

## Overview

Streamify is a full-stack IPTV streaming application built with modern technologies to handle large-scale content delivery with optimal performance.

### Technology Stack

- **Frontend**: Expo (React Native), TypeScript, Expo Router
- **Backend**: FastAPI (Python), async/await
- **Database**: MongoDB with Motor (async driver)
- **Video Streaming**: HLS.js, expo-av
- **Authentication**: JWT

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
├──────────────┬──────────────┬─────────────┬─────────────────┤
│   iOS App    │  Android App │   Web App   │   Expo Go       │
└──────────────┴──────────────┴─────────────┴─────────────────┘
                              │
                              ├─── Expo Router (File-based routing)
                              │
                              ├─── UI Components (Tamagui)
                              │
                              ├─── State Management (Zustand)
                              │
                              ├─── API Client (Axios)
                              │
                              └─── Video Player (HLS.js / expo-av)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         API Layer                            │
├─────────────────────────────────────────────────────────────┤
│                       FastAPI Server                         │
│  ┌────────────┬────────────┬────────────┬────────────┐     │
│  │   Auth     │  Playlists │  Content   │   Proxy    │     │
│  │  Endpoints │  Endpoints │ Endpoints  │  Endpoints │     │
│  └────────────┴────────────┴────────────┴────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Database Layer                          │
├─────────────────────────────────────────────────────────────┤
│                         MongoDB                              │
│  ┌────────┬────────────┬──────────┬────────────┐           │
│  │ Users  │ Playlists  │ Channels │  Favorites │           │
│  └────────┴────────────┴──────────┴────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### File-Based Routing (Expo Router)

```
app/
├── (tabs)/           # Tab navigation
│   ├── tv.tsx        # TV channels screen
│   ├── movies.tsx    # Movies screen
│   ├── series.tsx    # Series screen
│   ├── favorites.tsx # Favorites screen
│   ├── playlists.tsx # Playlists management
│   ├── admin.tsx     # Admin panel
│   └── settings.tsx  # App settings
├── auth/
│   ├── login.tsx     # Login screen
│   └── register.tsx  # Registration screen
├── player.tsx        # Video player
└── _layout.tsx       # Root layout
```

### State Management

- **Authentication**: Context API (AuthContext)
- **Theme**: Custom useTheme hook
- **API State**: Local component state with useEffect

### Component Architecture

```
Components are organized by feature:

src/
├── components/
│   ├── ContentCard.tsx      # Reusable content card
│   ├── PlaylistCard.tsx     # Playlist display card
│   └── SearchBar.tsx        # Search component
├── contexts/
│   └── AuthContext.tsx      # Authentication context
├── hooks/
│   └── useTheme.ts          # Theme hook
├── services/
│   └── api.ts               # API client configuration
└── theme/
    └── colors.ts            # Theme colors
```

## Backend Architecture

### API Design

RESTful API with the following structure:

```
/api
├── /auth
│   ├── POST /register       # User registration
│   ├── POST /login          # User login
│   └── GET  /me             # Get current user
├── /playlists
│   ├── GET    /             # List playlists
│   ├── POST   /             # Add M3U URL playlist
│   ├── POST   /file         # Upload M3U file
│   ├── POST   /xtream       # Add Xtream Codes
│   ├── DELETE /{id}         # Delete playlist
│   ├── GET    /{id}/channels # Get channels
│   ├── GET    /{id}/movies   # Get movies
│   └── GET    /{id}/series   # Get series
├── /favorites
│   ├── GET    /             # List favorites
│   ├── POST   /             # Add favorite
│   └── DELETE /{id}         # Remove favorite
└── /proxy
    ├── GET /stream          # Proxy video stream
    └── GET /m3u8            # Proxy M3U8 playlist
```

### Async Processing

All database operations use async/await with Motor:

```python
async def get_playlists(user_id: str):
    cursor = db.playlists.find({"user_id": user_id})
    playlists = await cursor.to_list(length=100)
    return playlists
```

## Database Design

### Collections

#### Users Collection
```json
{
  "_id": ObjectId,
  "id": "uuid",
  "email": "user@example.com",
  "password_hash": "hashed_password",
  "name": "User Name",
  "created_at": ISODate
}
```

#### Playlists Collection
```json
{
  "_id": ObjectId,
  "id": "uuid",
  "user_id": "user_uuid",
  "name": "My Playlist",
  "type": "m3u|xtream",
  "status": "loading|ready",
  "channel_count": 1761,
  "movie_count": 41224,
  "series_count": 271079,
  "created_at": ISODate
}
```

#### Channels Collection
```json
{
  "_id": ObjectId,
  "id": "uuid",
  "playlist_id": "playlist_uuid",
  "name": "Channel Name",
  "url": "http://stream.url",
  "logo": "http://logo.url",
  "group": "Category",
  "stream_type": "live|movie|series",
  "epg_channel_id": "optional"
}
```

### Indexes

```python
# Performance optimization indexes
db.users.create_index("email", unique=True)
db.playlists.create_index("user_id")
db.channels.create_index([("playlist_id", 1), ("stream_type", 1)])
db.favorites.create_index([("user_id", 1), ("channel_id", 1)])
```

## Video Streaming Architecture

### CORS Bypass with Proxy

```
┌─────────┐         ┌─────────┐         ┌──────────┐
│ Browser │────1───▶│ FastAPI │────2───▶│  IPTV    │
│         │         │  Proxy  │         │  Server  │
│         │◀───4────│         │◀───3────│          │
└─────────┘         └─────────┘         └──────────┘

1. Request with Base64-encoded URL
2. Backend fetches from IPTV server
3. Stream data returned
4. Browser receives with CORS headers
```

### HLS.js Integration

For M3U8 streams on web:

```javascript
const hls = new Hls({
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 90,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
});

hls.loadSource(proxyUrl);
hls.attachMedia(videoElement);
```

## Scalability

### Content Scaling

**Challenge**: MongoDB 16MB document limit

**Solution**: Separate channels into own collection

```python
# Instead of embedding all channels in playlist:
playlist = {
    "channels": [...]  # Can hit 16MB limit
}

# We reference channels by playlist_id:
playlist = {
    "channel_count": 1761
}
channel = {
    "playlist_id": "uuid"  # Reference
}
```

### API Pagination

All list endpoints support pagination:

```
GET /api/playlists/{id}/channels?skip=0&limit=50
```

### Background Processing

Large playlists are processed asynchronously:

```python
# Return immediately with loading status
playlist["status"] = "loading"

# Process in background
asyncio.create_task(process_playlist(playlist_id))
```

## Security

### Authentication

- JWT tokens with 7-day expiration
- Secure password hashing with bcrypt
- Token stored in memory (not localStorage for security)

### API Security

- CORS configured for specific origins
- Input validation with Pydantic
- SQL injection protection (using MongoDB)
- Rate limiting (recommended for production)

### Environment Variables

All sensitive data in environment variables:

```env
SECRET_KEY=random-secret-key
MONGO_URL=mongodb://localhost:27017
```

## Performance Optimizations

1. **Database Indexes**: Fast queries on common fields
2. **Pagination**: Limit data transfer
3. **Chunked Streaming**: Video data in 64KB chunks
4. **Async Operations**: Non-blocking I/O
5. **Client-side Caching**: Reduce API calls
6. **HLS.js Buffer Management**: Smooth playback

## Monitoring & Logging

```python
import logging

logger = logging.getLogger(__name__)
logger.info(f"Proxying stream: {url}")
```

## Future Enhancements

1. **Redis Caching**: Cache frequently accessed data
2. **CDN Integration**: Faster content delivery
3. **Microservices**: Split monolith into services
4. **Load Balancing**: Horizontal scaling
5. **Real-time Analytics**: WebSocket integration

---

*This architecture is designed to be scalable, maintainable, and performant for modern IPTV streaming needs.*
