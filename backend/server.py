from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import re
import aiohttp

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'iptv-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class Channel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    logo: Optional[str] = None
    group: Optional[str] = "Uncategorized"
    epg_id: Optional[str] = None
    stream_type: str = "live"  # live, movie, series

class PlaylistCreate(BaseModel):
    name: str
    url: Optional[str] = None
    content: Optional[str] = None

class XtreamCreate(BaseModel):
    name: str
    server_url: str
    username: str
    password: str

class PlaylistResponse(BaseModel):
    id: str
    user_id: str
    name: str
    playlist_type: str  # m3u or xtream
    channel_count: int
    movie_count: int
    series_count: int
    created_at: datetime

class FavoriteCreate(BaseModel):
    channel_name: str
    channel_url: str
    channel_logo: Optional[str] = None
    channel_group: Optional[str] = None
    content_type: str = "live"  # live, movie, series

class FavoriteResponse(BaseModel):
    id: str
    user_id: str
    channel_name: str
    channel_url: str
    channel_logo: Optional[str] = None
    channel_group: Optional[str] = None
    content_type: str = "live"
    created_at: datetime

class SeriesInfo(BaseModel):
    id: str
    name: str
    cover: Optional[str] = None
    plot: Optional[str] = None
    cast: Optional[str] = None
    genre: Optional[str] = None
    rating: Optional[str] = None
    category: Optional[str] = None

class SeasonInfo(BaseModel):
    season_number: int
    episodes: List[dict]

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        user = await db.users.find_one({'id': user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def parse_m3u(content: str) -> dict:
    """Parse M3U/M3U8 playlist content and extract channels, movies, series"""
    channels = []
    movies = []
    series = []
    lines = content.strip().split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith('#EXTINF:'):
            # Parse EXTINF line
            channel_info = {
                'id': str(uuid.uuid4()),
                'name': 'Unknown Channel',
                'url': '',
                'logo': None,
                'group': 'Uncategorized',
                'epg_id': None,
                'stream_type': 'live'
            }
            
            # Extract tvg-logo
            logo_match = re.search(r'tvg-logo="([^"]+)"', line)
            if logo_match:
                channel_info['logo'] = logo_match.group(1)
            
            # Extract group-title
            group_match = re.search(r'group-title="([^"]+)"', line)
            if group_match:
                channel_info['group'] = group_match.group(1)
            
            # Extract tvg-id for EPG
            epg_match = re.search(r'tvg-id="([^"]+)"', line)
            if epg_match:
                channel_info['epg_id'] = epg_match.group(1)
            
            # Extract channel name (after the last comma)
            name_match = re.search(r',(.+)$', line)
            if name_match:
                channel_info['name'] = name_match.group(1).strip()
            
            # Get URL from next non-comment line
            i += 1
            while i < len(lines):
                url_line = lines[i].strip()
                if url_line and not url_line.startswith('#'):
                    channel_info['url'] = url_line
                    break
                i += 1
            
            if channel_info['url']:
                # Categorize based on group or URL
                group_lower = channel_info['group'].lower()
                url_lower = channel_info['url'].lower()
                
                if any(x in group_lower for x in ['movie', 'film', 'vod']) or '/movie/' in url_lower:
                    channel_info['stream_type'] = 'movie'
                    movies.append(channel_info)
                elif any(x in group_lower for x in ['series', 'serie', 'tv show', 'episode']) or '/series/' in url_lower:
                    channel_info['stream_type'] = 'series'
                    series.append(channel_info)
                else:
                    channel_info['stream_type'] = 'live'
                    channels.append(channel_info)
        
        i += 1
    
    return {
        'channels': channels,
        'movies': movies,
        'series': series
    }

async def fetch_xtream_data(server_url: str, username: str, password: str) -> dict:
    """Fetch data from Xtream Codes API"""
    base_url = server_url.rstrip('/')
    
    # Ensure proper URL format
    if not base_url.startswith('http'):
        base_url = 'http://' + base_url
    
    channels = []
    movies = []
    series = []
    categories = {'live': {}, 'vod': {}, 'series': {}}
    
    async with aiohttp.ClientSession() as session:
        timeout = aiohttp.ClientTimeout(total=60)
        
        # Fetch live categories
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_live_categories"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for cat in data:
                        categories['live'][str(cat.get('category_id', ''))] = cat.get('category_name', 'Uncategorized')
        except Exception as e:
            logger.warning(f"Error fetching live categories: {e}")
        
        # Fetch VOD categories
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_vod_categories"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for cat in data:
                        categories['vod'][str(cat.get('category_id', ''))] = cat.get('category_name', 'Uncategorized')
        except Exception as e:
            logger.warning(f"Error fetching VOD categories: {e}")
        
        # Fetch Series categories
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_series_categories"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for cat in data:
                        categories['series'][str(cat.get('category_id', ''))] = cat.get('category_name', 'Uncategorized')
        except Exception as e:
            logger.warning(f"Error fetching series categories: {e}")
        
        # Fetch live streams
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_live_streams"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for stream in data:
                        cat_id = str(stream.get('category_id', ''))
                        channels.append({
                            'id': str(uuid.uuid4()),
                            'stream_id': stream.get('stream_id'),
                            'name': stream.get('name', 'Unknown'),
                            'url': f"{base_url}/live/{username}/{password}/{stream.get('stream_id')}.m3u8",
                            'logo': stream.get('stream_icon'),
                            'group': categories['live'].get(cat_id, 'Uncategorized'),
                            'epg_id': stream.get('epg_channel_id'),
                            'stream_type': 'live'
                        })
        except Exception as e:
            logger.error(f"Error fetching live streams: {e}")
        
        # Fetch VOD streams (movies)
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_vod_streams"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for stream in data:
                        cat_id = str(stream.get('category_id', ''))
                        ext = stream.get('container_extension', 'mp4')
                        movies.append({
                            'id': str(uuid.uuid4()),
                            'stream_id': stream.get('stream_id'),
                            'name': stream.get('name', 'Unknown'),
                            'url': f"{base_url}/movie/{username}/{password}/{stream.get('stream_id')}.{ext}",
                            'logo': stream.get('stream_icon'),
                            'group': categories['vod'].get(cat_id, 'Uncategorized'),
                            'plot': stream.get('plot'),
                            'rating': stream.get('rating'),
                            'stream_type': 'movie'
                        })
        except Exception as e:
            logger.error(f"Error fetching VOD streams: {e}")
        
        # Fetch Series
        try:
            url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_series"
            async with session.get(url, timeout=timeout) as response:
                if response.status == 200:
                    data = await response.json()
                    for serie in data:
                        cat_id = str(serie.get('category_id', ''))
                        series.append({
                            'id': str(uuid.uuid4()),
                            'series_id': serie.get('series_id'),
                            'name': serie.get('name', 'Unknown'),
                            'logo': serie.get('cover'),
                            'group': categories['series'].get(cat_id, 'Uncategorized'),
                            'plot': serie.get('plot'),
                            'cast': serie.get('cast'),
                            'genre': serie.get('genre'),
                            'rating': serie.get('rating'),
                            'stream_type': 'series'
                        })
        except Exception as e:
            logger.error(f"Error fetching series: {e}")
    
    return {
        'channels': channels,
        'movies': movies,
        'series': series
    }

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({'email': user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = {
        'id': str(uuid.uuid4()),
        'email': user_data.email.lower(),
        'password_hash': hash_password(user_data.password),
        'name': user_data.name,
        'created_at': datetime.utcnow()
    }
    await db.users.insert_one(user)
    
    token = create_token(user['id'])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            created_at=user['created_at']
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({'email': user_data.email.lower()})
    if not user or not verify_password(user_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user['id'])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user.get('name'),
            created_at=user['created_at']
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user=Depends(get_current_user)):
    return UserResponse(
        id=user['id'],
        email=user['email'],
        name=user.get('name'),
        created_at=user['created_at']
    )

# ==================== PLAYLIST ROUTES ====================

@api_router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(playlist_data: PlaylistCreate, user=Depends(get_current_user)):
    """Create a playlist from M3U content or URL"""
    content = playlist_data.content
    
    # If URL provided, fetch content
    if playlist_data.url and not content:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(playlist_data.url, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    if response.status == 200:
                        content = await response.text()
                    else:
                        raise HTTPException(status_code=400, detail="Failed to fetch playlist from URL")
        except Exception as e:
            logger.error(f"Error fetching playlist: {e}")
            raise HTTPException(status_code=400, detail=f"Error fetching playlist: {str(e)}")
    
    if not content:
        raise HTTPException(status_code=400, detail="No playlist content provided")
    
    # Parse M3U content
    parsed = parse_m3u(content)
    total_items = len(parsed['channels']) + len(parsed['movies']) + len(parsed['series'])
    
    if total_items == 0:
        raise HTTPException(status_code=400, detail="No valid content found in playlist")
    
    playlist = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'name': playlist_data.name,
        'playlist_type': 'm3u',
        'url': playlist_data.url,
        'channels': parsed['channels'],
        'movies': parsed['movies'],
        'series': parsed['series'],
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        playlist_type='m3u',
        channel_count=len(parsed['channels']),
        movie_count=len(parsed['movies']),
        series_count=len(parsed['series']),
        created_at=playlist['created_at']
    )

@api_router.post("/playlists/xtream", response_model=PlaylistResponse)
async def create_xtream_playlist(xtream_data: XtreamCreate, user=Depends(get_current_user)):
    """Create a playlist from Xtream Codes API"""
    try:
        data = await fetch_xtream_data(
            xtream_data.server_url,
            xtream_data.username,
            xtream_data.password
        )
    except Exception as e:
        logger.error(f"Error fetching Xtream data: {e}")
        raise HTTPException(status_code=400, detail=f"Error connecting to Xtream server: {str(e)}")
    
    total_items = len(data['channels']) + len(data['movies']) + len(data['series'])
    
    if total_items == 0:
        raise HTTPException(status_code=400, detail="No content found. Check your credentials and server URL.")
    
    playlist = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'name': xtream_data.name,
        'playlist_type': 'xtream',
        'xtream_server': xtream_data.server_url,
        'xtream_username': xtream_data.username,
        'xtream_password': xtream_data.password,
        'channels': data['channels'],
        'movies': data['movies'],
        'series': data['series'],
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        playlist_type='xtream',
        channel_count=len(data['channels']),
        movie_count=len(data['movies']),
        series_count=len(data['series']),
        created_at=playlist['created_at']
    )

@api_router.post("/playlists/{playlist_id}/refresh")
async def refresh_playlist(playlist_id: str, user=Depends(get_current_user)):
    """Refresh an Xtream playlist to get updated content"""
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if playlist.get('playlist_type') != 'xtream':
        raise HTTPException(status_code=400, detail="Only Xtream playlists can be refreshed")
    
    try:
        data = await fetch_xtream_data(
            playlist['xtream_server'],
            playlist['xtream_username'],
            playlist['xtream_password']
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error refreshing playlist: {str(e)}")
    
    await db.playlists.update_one(
        {'id': playlist_id},
        {'$set': {
            'channels': data['channels'],
            'movies': data['movies'],
            'series': data['series'],
            'updated_at': datetime.utcnow()
        }}
    )
    
    return {
        "message": "Playlist refreshed",
        "channel_count": len(data['channels']),
        "movie_count": len(data['movies']),
        "series_count": len(data['series'])
    }

@api_router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(user=Depends(get_current_user)):
    playlists = await db.playlists.find({'user_id': user['id']}).to_list(100)
    return [
        PlaylistResponse(
            id=p['id'],
            user_id=p['user_id'],
            name=p['name'],
            playlist_type=p.get('playlist_type', 'm3u'),
            channel_count=len(p.get('channels', [])),
            movie_count=len(p.get('movies', [])),
            series_count=len(p.get('series', [])),
            created_at=p['created_at']
        )
        for p in playlists
    ]

@api_router.get("/playlists/{playlist_id}/channels")
async def get_playlist_channels(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    channels = playlist.get('channels', [])
    
    # Filter by search query
    if search:
        search_lower = search.lower()
        channels = [ch for ch in channels if search_lower in ch['name'].lower()]
    
    # Filter by group
    if group:
        channels = [ch for ch in channels if ch.get('group') == group]
    
    total = len(channels)
    
    return {
        "total": total,
        "items": channels[skip:skip + limit]
    }

@api_router.get("/playlists/{playlist_id}/movies")
async def get_playlist_movies(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    movies = playlist.get('movies', [])
    
    # Filter by search query
    if search:
        search_lower = search.lower()
        movies = [m for m in movies if search_lower in m['name'].lower()]
    
    # Filter by group
    if group:
        movies = [m for m in movies if m.get('group') == group]
    
    total = len(movies)
    
    return {
        "total": total,
        "items": movies[skip:skip + limit]
    }

@api_router.get("/playlists/{playlist_id}/series")
async def get_playlist_series(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    series = playlist.get('series', [])
    
    # Filter by search query
    if search:
        search_lower = search.lower()
        series = [s for s in series if search_lower in s['name'].lower()]
    
    # Filter by group
    if group:
        series = [s for s in series if s.get('group') == group]
    
    total = len(series)
    
    return {
        "total": total,
        "items": series[skip:skip + limit]
    }

@api_router.get("/playlists/{playlist_id}/series/{series_id}/episodes")
async def get_series_episodes(
    playlist_id: str,
    series_id: str,
    user=Depends(get_current_user)
):
    """Get episodes for a series from Xtream API"""
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if playlist.get('playlist_type') != 'xtream':
        raise HTTPException(status_code=400, detail="Episodes only available for Xtream playlists")
    
    # Find the series
    series_item = None
    for s in playlist.get('series', []):
        if s['id'] == series_id or str(s.get('series_id')) == series_id:
            series_item = s
            break
    
    if not series_item:
        raise HTTPException(status_code=404, detail="Series not found")
    
    xtream_series_id = series_item.get('series_id')
    if not xtream_series_id:
        raise HTTPException(status_code=400, detail="Series ID not available")
    
    base_url = playlist['xtream_server'].rstrip('/')
    username = playlist['xtream_username']
    password = playlist['xtream_password']
    
    async with aiohttp.ClientSession() as session:
        url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_series_info&series_id={xtream_series_id}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
            if response.status == 200:
                data = await response.json()
                episodes_data = data.get('episodes', {})
                seasons = []
                
                for season_num, episodes in episodes_data.items():
                    season_episodes = []
                    for ep in episodes:
                        ext = ep.get('container_extension', 'mp4')
                        season_episodes.append({
                            'id': ep.get('id'),
                            'episode_num': ep.get('episode_num'),
                            'title': ep.get('title', f"Episode {ep.get('episode_num')}"),
                            'plot': ep.get('plot'),
                            'duration': ep.get('duration'),
                            'url': f"{base_url}/series/{username}/{password}/{ep.get('id')}.{ext}"
                        })
                    seasons.append({
                        'season_number': int(season_num),
                        'episodes': season_episodes
                    })
                
                seasons.sort(key=lambda x: x['season_number'])
                return {
                    'series_info': data.get('info', {}),
                    'seasons': seasons
                }
            else:
                raise HTTPException(status_code=400, detail="Failed to fetch series info")

@api_router.get("/playlists/{playlist_id}/groups/{content_type}")
async def get_playlist_groups(playlist_id: str, content_type: str, user=Depends(get_current_user)):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if content_type == 'live':
        items = playlist.get('channels', [])
    elif content_type == 'movie':
        items = playlist.get('movies', [])
    elif content_type == 'series':
        items = playlist.get('series', [])
    else:
        raise HTTPException(status_code=400, detail="Invalid content type")
    
    groups = set()
    for item in items:
        if item.get('group'):
            groups.add(item['group'])
    
    return sorted(list(groups))

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user=Depends(get_current_user)):
    result = await db.playlists.delete_one({'id': playlist_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"message": "Playlist deleted"}

# ==================== FAVORITES ROUTES ====================

@api_router.post("/favorites", response_model=FavoriteResponse)
async def add_favorite(favorite_data: FavoriteCreate, user=Depends(get_current_user)):
    # Check if already favorited
    existing = await db.favorites.find_one({
        'user_id': user['id'],
        'channel_url': favorite_data.channel_url
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already in favorites")
    
    favorite = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'channel_name': favorite_data.channel_name,
        'channel_url': favorite_data.channel_url,
        'channel_logo': favorite_data.channel_logo,
        'channel_group': favorite_data.channel_group,
        'content_type': favorite_data.content_type,
        'created_at': datetime.utcnow()
    }
    await db.favorites.insert_one(favorite)
    
    return FavoriteResponse(**favorite)

@api_router.get("/favorites", response_model=List[FavoriteResponse])
async def get_favorites(content_type: Optional[str] = None, user=Depends(get_current_user)):
    query = {'user_id': user['id']}
    if content_type:
        query['content_type'] = content_type
    
    favorites = await db.favorites.find(query).to_list(1000)
    return [FavoriteResponse(**f) for f in favorites]

@api_router.delete("/favorites/{favorite_id}")
async def remove_favorite(favorite_id: str, user=Depends(get_current_user)):
    result = await db.favorites.delete_one({'id': favorite_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Removed from favorites"}

@api_router.delete("/favorites/by-url/{channel_url:path}")
async def remove_favorite_by_url(channel_url: str, user=Depends(get_current_user)):
    result = await db.favorites.delete_one({'channel_url': channel_url, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Removed from favorites"}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "IPTV API is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
