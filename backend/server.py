from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
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
import base64
from urllib.parse import urlparse, urljoin

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
    status: str = "ready"  # ready, loading, error
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
            logo_match = re.search(r'tvg-logo="([^"]*)"', line)
            if logo_match:
                channel_info['logo'] = logo_match.group(1) or None
            
            # Extract group-title
            group_match = re.search(r'group-title="([^"]*)"', line)
            if group_match:
                channel_info['group'] = group_match.group(1) or 'Uncategorized'
            
            # Extract tvg-id for EPG
            epg_match = re.search(r'tvg-id="([^"]*)"', line)
            if epg_match:
                channel_info['epg_id'] = epg_match.group(1) or None
            
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
                
                if any(x in group_lower for x in ['movie', 'film', 'vod', 'cinema', 'biograf']) or '/movie/' in url_lower:
                    channel_info['stream_type'] = 'movie'
                    movies.append(channel_info)
                elif any(x in group_lower for x in ['series', 'serie', 'tv show', 'episode', 'serier']) or '/series/' in url_lower:
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

async def process_m3u_playlist(playlist_id: str, user_id: str, content: str):
    """Background task to process large M3U playlists"""
    try:
        logger.info(f"Processing playlist {playlist_id}")
        
        # Parse M3U content
        parsed = parse_m3u(content)
        
        channel_count = len(parsed['channels'])
        movie_count = len(parsed['movies'])
        series_count = len(parsed['series'])
        
        logger.info(f"Parsed {channel_count} channels, {movie_count} movies, {series_count} series")
        
        # Delete existing channels for this playlist
        await db.channels.delete_many({'playlist_id': playlist_id})
        
        # Insert channels in batches
        batch_size = 1000
        
        # Process channels
        for i in range(0, len(parsed['channels']), batch_size):
            batch = parsed['channels'][i:i+batch_size]
            for ch in batch:
                ch['playlist_id'] = playlist_id
                ch['user_id'] = user_id
            if batch:
                await db.channels.insert_many(batch)
        
        # Process movies
        for i in range(0, len(parsed['movies']), batch_size):
            batch = parsed['movies'][i:i+batch_size]
            for ch in batch:
                ch['playlist_id'] = playlist_id
                ch['user_id'] = user_id
            if batch:
                await db.channels.insert_many(batch)
        
        # Process series
        for i in range(0, len(parsed['series']), batch_size):
            batch = parsed['series'][i:i+batch_size]
            for ch in batch:
                ch['playlist_id'] = playlist_id
                ch['user_id'] = user_id
            if batch:
                await db.channels.insert_many(batch)
        
        # Update playlist with counts
        await db.playlists.update_one(
            {'id': playlist_id},
            {'$set': {
                'channel_count': channel_count,
                'movie_count': movie_count,
                'series_count': series_count,
                'status': 'ready'
            }}
        )
        
        logger.info(f"Playlist {playlist_id} processing complete")
        
    except Exception as e:
        logger.error(f"Error processing playlist {playlist_id}: {e}")
        await db.playlists.update_one(
            {'id': playlist_id},
            {'$set': {'status': 'error', 'error_message': str(e)}}
        )

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
async def create_playlist(playlist_data: PlaylistCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Create a playlist from M3U content or URL"""
    content = playlist_data.content
    
    # If URL provided, fetch content
    if playlist_data.url and not content:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(playlist_data.url, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    if response.status == 200:
                        content = await response.text()
                    else:
                        raise HTTPException(status_code=400, detail="Failed to fetch playlist from URL")
        except aiohttp.ClientError as e:
            logger.error(f"Error fetching playlist: {e}")
            raise HTTPException(status_code=400, detail=f"Error fetching playlist: {str(e)}")
    
    if not content:
        raise HTTPException(status_code=400, detail="No playlist content provided")
    
    # Create playlist record first
    playlist_id = str(uuid.uuid4())
    playlist = {
        'id': playlist_id,
        'user_id': user['id'],
        'name': playlist_data.name,
        'playlist_type': 'm3u',
        'url': playlist_data.url,
        'channel_count': 0,
        'movie_count': 0,
        'series_count': 0,
        'status': 'loading',
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    # Process in background for large playlists
    background_tasks.add_task(process_m3u_playlist, playlist_id, user['id'], content)
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        playlist_type='m3u',
        channel_count=0,
        movie_count=0,
        series_count=0,
        status='loading',
        created_at=playlist['created_at']
    )

@api_router.post("/playlists/xtream", response_model=PlaylistResponse)
async def create_xtream_playlist(xtream_data: XtreamCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Create a playlist from Xtream Codes API"""
    base_url = xtream_data.server_url.rstrip('/')
    if not base_url.startswith('http'):
        base_url = 'http://' + base_url
    
    # Create playlist record first
    playlist_id = str(uuid.uuid4())
    playlist = {
        'id': playlist_id,
        'user_id': user['id'],
        'name': xtream_data.name,
        'playlist_type': 'xtream',
        'xtream_server': base_url,
        'xtream_username': xtream_data.username,
        'xtream_password': xtream_data.password,
        'channel_count': 0,
        'movie_count': 0,
        'series_count': 0,
        'status': 'loading',
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    # Process in background
    background_tasks.add_task(
        process_xtream_playlist, 
        playlist_id, 
        user['id'], 
        base_url, 
        xtream_data.username, 
        xtream_data.password
    )
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        playlist_type='xtream',
        channel_count=0,
        movie_count=0,
        series_count=0,
        status='loading',
        created_at=playlist['created_at']
    )

async def process_xtream_playlist(playlist_id: str, user_id: str, base_url: str, username: str, password: str):
    """Background task to process Xtream playlists"""
    try:
        logger.info(f"Processing Xtream playlist {playlist_id}")
        
        channels = []
        movies = []
        series = []
        categories = {'live': {}, 'vod': {}, 'series': {}}
        
        async with aiohttp.ClientSession() as session:
            timeout = aiohttp.ClientTimeout(total=120)
            
            # Fetch categories
            for cat_type, action in [('live', 'get_live_categories'), ('vod', 'get_vod_categories'), ('series', 'get_series_categories')]:
                try:
                    url = f"{base_url}/player_api.php?username={username}&password={password}&action={action}"
                    async with session.get(url, timeout=timeout) as response:
                        if response.status == 200:
                            data = await response.json()
                            if isinstance(data, list):
                                for cat in data:
                                    categories[cat_type][str(cat.get('category_id', ''))] = cat.get('category_name', 'Uncategorized')
                except Exception as e:
                    logger.warning(f"Error fetching {cat_type} categories: {e}")
            
            # Fetch live streams
            try:
                url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_live_streams"
                async with session.get(url, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        if isinstance(data, list):
                            for stream in data:
                                cat_id = str(stream.get('category_id', ''))
                                channels.append({
                                    'id': str(uuid.uuid4()),
                                    'playlist_id': playlist_id,
                                    'user_id': user_id,
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
            
            # Fetch VOD
            try:
                url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_vod_streams"
                async with session.get(url, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        if isinstance(data, list):
                            for stream in data:
                                cat_id = str(stream.get('category_id', ''))
                                ext = stream.get('container_extension', 'mp4')
                                movies.append({
                                    'id': str(uuid.uuid4()),
                                    'playlist_id': playlist_id,
                                    'user_id': user_id,
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
                logger.error(f"Error fetching VOD: {e}")
            
            # Fetch Series
            try:
                url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_series"
                async with session.get(url, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        if isinstance(data, list):
                            for serie in data:
                                cat_id = str(serie.get('category_id', ''))
                                series.append({
                                    'id': str(uuid.uuid4()),
                                    'playlist_id': playlist_id,
                                    'user_id': user_id,
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
        
        # Delete existing channels for this playlist
        await db.channels.delete_many({'playlist_id': playlist_id})
        
        # Insert in batches
        batch_size = 1000
        for items in [channels, movies, series]:
            for i in range(0, len(items), batch_size):
                batch = items[i:i+batch_size]
                if batch:
                    await db.channels.insert_many(batch)
        
        # Update playlist
        await db.playlists.update_one(
            {'id': playlist_id},
            {'$set': {
                'channel_count': len(channels),
                'movie_count': len(movies),
                'series_count': len(series),
                'status': 'ready'
            }}
        )
        
        logger.info(f"Xtream playlist {playlist_id} complete: {len(channels)} channels, {len(movies)} movies, {len(series)} series")
        
    except Exception as e:
        logger.error(f"Error processing Xtream playlist {playlist_id}: {e}")
        await db.playlists.update_one(
            {'id': playlist_id},
            {'$set': {'status': 'error', 'error_message': str(e)}}
        )

@api_router.post("/playlists/{playlist_id}/refresh")
async def refresh_playlist(playlist_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Refresh an Xtream playlist to get updated content"""
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    if playlist.get('playlist_type') != 'xtream':
        raise HTTPException(status_code=400, detail="Only Xtream playlists can be refreshed")
    
    # Update status
    await db.playlists.update_one(
        {'id': playlist_id},
        {'$set': {'status': 'loading'}}
    )
    
    # Process in background
    background_tasks.add_task(
        process_xtream_playlist,
        playlist_id,
        user['id'],
        playlist['xtream_server'],
        playlist['xtream_username'],
        playlist['xtream_password']
    )
    
    return {"message": "Refresh started", "status": "loading"}

@api_router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(user=Depends(get_current_user)):
    playlists = await db.playlists.find({'user_id': user['id']}).to_list(100)
    return [
        PlaylistResponse(
            id=p['id'],
            user_id=p['user_id'],
            name=p['name'],
            playlist_type=p.get('playlist_type', 'm3u'),
            channel_count=p.get('channel_count', 0),
            movie_count=p.get('movie_count', 0),
            series_count=p.get('series_count', 0),
            status=p.get('status', 'ready'),
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
    limit: int = 50,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Build query
    query = {'playlist_id': playlist_id, 'stream_type': 'live'}
    
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    
    if group:
        query['group'] = group
    
    # Get total count
    total = await db.channels.count_documents(query)
    
    # Get items
    items = await db.channels.find(query).skip(skip).limit(limit).to_list(limit)
    
    # Remove MongoDB _id from response
    for item in items:
        item.pop('_id', None)
    
    return {
        "total": total,
        "items": items
    }

@api_router.get("/playlists/{playlist_id}/movies")
async def get_playlist_movies(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    query = {'playlist_id': playlist_id, 'stream_type': 'movie'}
    
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    
    if group:
        query['group'] = group
    
    total = await db.channels.count_documents(query)
    items = await db.channels.find(query).skip(skip).limit(limit).to_list(limit)
    
    for item in items:
        item.pop('_id', None)
    
    return {
        "total": total,
        "items": items
    }

@api_router.get("/playlists/{playlist_id}/series")
async def get_playlist_series(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    query = {'playlist_id': playlist_id, 'stream_type': 'series'}
    
    if search:
        query['name'] = {'$regex': search, '$options': 'i'}
    
    if group:
        query['group'] = group
    
    total = await db.channels.count_documents(query)
    items = await db.channels.find(query).skip(skip).limit(limit).to_list(limit)
    
    for item in items:
        item.pop('_id', None)
    
    return {
        "total": total,
        "items": items
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
    
    base_url = playlist['xtream_server']
    username = playlist['xtream_username']
    password = playlist['xtream_password']
    
    async with aiohttp.ClientSession() as session:
        url = f"{base_url}/player_api.php?username={username}&password={password}&action=get_series_info&series_id={series_id}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
            if response.status == 200:
                data = await response.json()
                
                # Handle different response formats
                if isinstance(data, dict):
                    episodes_data = data.get('episodes', {})
                    info = data.get('info', {})
                else:
                    episodes_data = {}
                    info = {}
                
                seasons = []
                
                if isinstance(episodes_data, dict):
                    for season_num, episodes in episodes_data.items():
                        season_episodes = []
                        if isinstance(episodes, list):
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
                    'series_info': info,
                    'seasons': seasons
                }
            else:
                raise HTTPException(status_code=400, detail="Failed to fetch series info")

@api_router.get("/playlists/{playlist_id}/groups/{content_type}")
async def get_playlist_groups(playlist_id: str, content_type: str, user=Depends(get_current_user)):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    stream_type_map = {
        'live': 'live',
        'movie': 'movie',
        'series': 'series'
    }
    
    stream_type = stream_type_map.get(content_type)
    if not stream_type:
        raise HTTPException(status_code=400, detail="Invalid content type")
    
    # Get distinct groups
    groups = await db.channels.distinct('group', {'playlist_id': playlist_id, 'stream_type': stream_type})
    
    return sorted([g for g in groups if g])

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user=Depends(get_current_user)):
    result = await db.playlists.delete_one({'id': playlist_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Also delete associated channels
    await db.channels.delete_many({'playlist_id': playlist_id})
    
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

# ==================== VIDEO PROXY ====================

async def stream_video(url: str):
    """Generator to stream video content"""
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=None, connect=30)) as response:
            async for chunk in response.content.iter_chunked(65536):  # 64KB chunks
                yield chunk

@api_router.get("/proxy/stream")
async def proxy_stream(url: str = Query(..., description="Base64 encoded video URL")):
    """Proxy video stream to bypass CORS"""
    try:
        # Decode the URL
        decoded_url = base64.b64decode(url).decode('utf-8')
        logger.info(f"Proxying stream: {decoded_url[:50]}...")
        
        # Determine content type based on URL
        if '.m3u8' in decoded_url:
            content_type = 'application/vnd.apple.mpegurl'
        elif '.ts' in decoded_url:
            content_type = 'video/mp2t'
        elif '.mp4' in decoded_url:
            content_type = 'video/mp4'
        else:
            content_type = 'video/mp2t'  # Default for IPTV streams
        
        return StreamingResponse(
            stream_video(decoded_url),
            media_type=content_type,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Cache-Control': 'no-cache',
            }
        )
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

@api_router.get("/proxy/m3u8")
async def proxy_m3u8(url: str = Query(..., description="Base64 encoded M3U8 URL")):
    """Proxy and rewrite M3U8 playlist to use proxy for segments"""
    try:
        decoded_url = base64.b64decode(url).decode('utf-8')
        logger.info(f"Proxying M3U8: {decoded_url[:50]}...")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(decoded_url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch playlist")
                
                content = await response.text()
                
                # Parse base URL for relative paths
                parsed = urlparse(decoded_url)
                base_url = f"{parsed.scheme}://{parsed.netloc}{'/'.join(parsed.path.split('/')[:-1])}/"
                
                # Rewrite URLs in the playlist to use our proxy
                lines = content.split('\n')
                rewritten_lines = []
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        rewritten_lines.append(line)
                        continue
                    
                    if line.startswith('#'):
                        # Handle URI in tags like #EXT-X-KEY
                        if 'URI="' in line:
                            import re
                            def replace_uri(match):
                                uri = match.group(1)
                                if not uri.startswith('http'):
                                    uri = urljoin(base_url, uri)
                                encoded = base64.b64encode(uri.encode()).decode()
                                return f'URI="/api/proxy/stream?url={encoded}"'
                            line = re.sub(r'URI="([^"]+)"', replace_uri, line)
                        rewritten_lines.append(line)
                    else:
                        # This is a URL line
                        if line.startswith('http'):
                            segment_url = line
                        else:
                            segment_url = urljoin(base_url, line)
                        
                        # Check if it's another m3u8 or a segment
                        if '.m3u8' in line:
                            encoded = base64.b64encode(segment_url.encode()).decode()
                            rewritten_lines.append(f"/api/proxy/m3u8?url={encoded}")
                        else:
                            encoded = base64.b64encode(segment_url.encode()).decode()
                            rewritten_lines.append(f"/api/proxy/stream?url={encoded}")
                
                rewritten_content = '\n'.join(rewritten_lines)
                
                return StreamingResponse(
                    iter([rewritten_content.encode()]),
                    media_type='application/vnd.apple.mpegurl',
                    headers={
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                    }
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"M3U8 proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"M3U8 proxy error: {str(e)}")

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create indexes on startup
@app.on_event("startup")
async def create_indexes():
    try:
        await db.channels.create_index([("playlist_id", 1), ("stream_type", 1)])
        await db.channels.create_index([("playlist_id", 1), ("name", 1)])
        await db.channels.create_index([("playlist_id", 1), ("group", 1)])
        logger.info("Database indexes created")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
