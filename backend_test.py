#!/usr/bin/env python3
"""
Backend API Testing for IPTV Streaming App
Focus: Video proxy for CORS bypass functionality
"""

import requests
import json
import base64
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.getenv('EXPO_PUBLIC_BACKEND_URL', 'https://multitv-player.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend at: {API_BASE}")

class IPTVTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        
    def test_auth_and_setup(self):
        """Test authentication and create test user"""
        print("\n=== Testing Authentication ===")
        
        # Test user registration
        register_data = {
            "email": "testuser@example.com",
            "password": "testpass123",
            "name": "Test User"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/auth/register", json=register_data)
            if response.status_code == 200:
                data = response.json()
                self.token = data['access_token']
                self.user_id = data['user']['id']
                print("✅ User registration successful")
                print(f"   Token: {self.token[:20]}...")
                print(f"   User ID: {self.user_id}")
                
                # Set authorization header for future requests
                self.session.headers.update({'Authorization': f'Bearer {self.token}'})
                return True
            elif response.status_code == 400 and "already registered" in response.text:
                # Try login instead
                print("   User already exists, trying login...")
                return self.test_login()
            else:
                print(f"❌ Registration failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Registration error: {e}")
            return False
    
    def test_login(self):
        """Test user login"""
        login_data = {
            "email": "testuser@example.com", 
            "password": "testpass123"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/auth/login", json=login_data)
            if response.status_code == 200:
                data = response.json()
                self.token = data['access_token']
                self.user_id = data['user']['id']
                print("✅ User login successful")
                print(f"   Token: {self.token[:20]}...")
                
                # Set authorization header
                self.session.headers.update({'Authorization': f'Bearer {self.token}'})
                return True
            else:
                print(f"❌ Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Login error: {e}")
            return False
    
    def create_test_playlist(self):
        """Create a test M3U playlist with sample streams"""
        print("\n=== Creating Test Playlist ===")
        
        # Sample M3U content with various stream types
        m3u_content = """#EXTM3U
#EXTINF:-1 tvg-id="test1" tvg-name="Test Channel 1" tvg-logo="https://example.com/logo1.png" group-title="Test Group",Test Channel 1
https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4
#EXTINF:-1 tvg-id="test2" tvg-name="Test HLS Stream" tvg-logo="https://example.com/logo2.png" group-title="Live TV",Test HLS Stream
https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8
#EXTINF:-1 tvg-id="test3" tvg-name="Test Movie" tvg-logo="https://example.com/logo3.png" group-title="Movies",Test Movie
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
"""
        
        playlist_data = {
            "name": "Test Playlist for Proxy",
            "content": m3u_content
        }
        
        try:
            response = self.session.post(f"{API_BASE}/playlists", json=playlist_data)
            if response.status_code == 200:
                data = response.json()
                playlist_id = data['id']
                print(f"✅ Test playlist created: {playlist_id}")
                print(f"   Status: {data['status']}")
                return playlist_id
            else:
                print(f"❌ Playlist creation failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Playlist creation error: {e}")
            return None
    
    def get_test_urls(self, playlist_id):
        """Get some test URLs from the playlist"""
        print("\n=== Getting Test Stream URLs ===")
        
        try:
            # Wait a moment for playlist processing
            import time
            time.sleep(2)
            
            # Get channels from playlist
            response = self.session.get(f"{API_BASE}/playlists/{playlist_id}/channels?limit=10")
            if response.status_code == 200:
                data = response.json()
                channels = data.get('items', [])
                
                if channels:
                    print(f"✅ Found {len(channels)} channels")
                    test_urls = []
                    for channel in channels[:3]:  # Take first 3 channels
                        url = channel.get('url')
                        name = channel.get('name')
                        if url:
                            test_urls.append({'name': name, 'url': url})
                            print(f"   - {name}: {url[:50]}...")
                    return test_urls
                else:
                    print("⚠️  No channels found in playlist yet (still processing)")
                    # Return some hardcoded test URLs
                    return [
                        {
                            'name': 'Test MP4 Stream',
                            'url': 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'
                        },
                        {
                            'name': 'Test HLS Stream', 
                            'url': 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
                        }
                    ]
            else:
                print(f"❌ Failed to get channels: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            print(f"❌ Error getting test URLs: {e}")
            return []
    
    def test_proxy_stream_endpoint(self, test_urls):
        """Test the /api/proxy/stream endpoint"""
        print("\n=== Testing /api/proxy/stream Endpoint ===")
        
        success_count = 0
        
        for url_info in test_urls:
            name = url_info['name']
            url = url_info['url']
            
            print(f"\nTesting: {name}")
            print(f"Original URL: {url}")
            
            try:
                # Base64 encode the URL
                encoded_url = base64.b64encode(url.encode()).decode()
                proxy_url = f"{API_BASE}/proxy/stream?url={encoded_url}"
                
                print(f"Proxy URL: {proxy_url[:80]}...")
                
                # Test the proxy endpoint
                response = self.session.get(proxy_url, timeout=30, stream=True)
                
                print(f"Status Code: {response.status_code}")
                print(f"Content-Type: {response.headers.get('Content-Type', 'Not set')}")
                
                # Check CORS headers
                cors_headers = {
                    'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                    'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                    'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
                }
                print(f"CORS Headers: {cors_headers}")
                
                if response.status_code == 200:
                    # Check if we're getting actual content
                    content_length = response.headers.get('Content-Length', 'Unknown')
                    print(f"Content-Length: {content_length}")
                    
                    # Read first chunk to verify streaming works
                    chunk_count = 0
                    total_bytes = 0
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            total_bytes += len(chunk)
                            chunk_count += 1
                            if chunk_count >= 3:  # Read first few chunks
                                break
                    
                    print(f"✅ Streaming works - Read {chunk_count} chunks, {total_bytes} bytes")
                    
                    # Verify CORS headers are present
                    if cors_headers['Access-Control-Allow-Origin'] == '*':
                        print("✅ CORS headers correctly set")
                        success_count += 1
                    else:
                        print("⚠️  CORS headers missing or incorrect")
                        
                else:
                    print(f"❌ Proxy failed with status {response.status_code}")
                    print(f"   Response: {response.text[:200]}")
                    
            except Exception as e:
                print(f"❌ Error testing proxy stream: {e}")
        
        print(f"\n📊 Proxy Stream Results: {success_count}/{len(test_urls)} successful")
        return success_count > 0
    
    def test_proxy_m3u8_endpoint(self, test_urls):
        """Test the /api/proxy/m3u8 endpoint"""
        print("\n=== Testing /api/proxy/m3u8 Endpoint ===")
        
        # Find M3U8 URLs to test
        m3u8_urls = [url_info for url_info in test_urls if '.m3u8' in url_info['url']]
        
        if not m3u8_urls:
            print("⚠️  No M3U8 URLs found in test data, using sample")
            m3u8_urls = [{
                'name': 'Apple Sample HLS',
                'url': 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
            }]
        
        success_count = 0
        
        for url_info in m3u8_urls:
            name = url_info['name']
            url = url_info['url']
            
            print(f"\nTesting M3U8: {name}")
            print(f"Original URL: {url}")
            
            try:
                # Base64 encode the URL
                encoded_url = base64.b64encode(url.encode()).decode()
                proxy_url = f"{API_BASE}/proxy/m3u8?url={encoded_url}"
                
                print(f"Proxy URL: {proxy_url[:80]}...")
                
                # Test the proxy endpoint
                response = self.session.get(proxy_url, timeout=30)
                
                print(f"Status Code: {response.status_code}")
                print(f"Content-Type: {response.headers.get('Content-Type', 'Not set')}")
                
                # Check CORS headers
                cors_headers = {
                    'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                    'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                    'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
                }
                print(f"CORS Headers: {cors_headers}")
                
                if response.status_code == 200:
                    content = response.text
                    print(f"Content length: {len(content)} characters")
                    
                    # Check if URLs have been rewritten to use proxy
                    if '/api/proxy/' in content:
                        print("✅ M3U8 URLs successfully rewritten to use proxy")
                        
                        # Show sample of rewritten content
                        lines = content.split('\n')[:10]
                        print("   Sample rewritten content:")
                        for line in lines:
                            if line.strip():
                                print(f"   {line}")
                        
                        # Verify CORS headers
                        if cors_headers['Access-Control-Allow-Origin'] == '*':
                            print("✅ CORS headers correctly set")
                            success_count += 1
                        else:
                            print("⚠️  CORS headers missing or incorrect")
                    else:
                        print("⚠️  URLs may not have been rewritten properly")
                        print(f"   Sample content: {content[:200]}...")
                        
                else:
                    print(f"❌ M3U8 proxy failed with status {response.status_code}")
                    print(f"   Response: {response.text[:200]}")
                    
            except Exception as e:
                print(f"❌ Error testing M3U8 proxy: {e}")
        
        print(f"\n📊 M3U8 Proxy Results: {success_count}/{len(m3u8_urls)} successful")
        return success_count > 0
    
    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n=== Testing Health Endpoints ===")
        
        endpoints = [
            ("/", "Root endpoint"),
            ("/health", "Health check")
        ]
        
        for endpoint, description in endpoints:
            try:
                response = self.session.get(f"{API_BASE}{endpoint}")
                if response.status_code == 200:
                    print(f"✅ {description}: {response.json()}")
                else:
                    print(f"❌ {description} failed: {response.status_code}")
            except Exception as e:
                print(f"❌ {description} error: {e}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting IPTV Backend API Tests")
        print("=" * 50)
        
        # Test authentication first
        if not self.test_auth_and_setup():
            print("❌ Authentication failed - cannot continue with proxy tests")
            return False
        
        # Test health endpoints
        self.test_health_endpoints()
        
        # Create test playlist
        playlist_id = self.create_test_playlist()
        if not playlist_id:
            print("❌ Could not create test playlist - using hardcoded URLs")
            test_urls = [
                {
                    'name': 'Test MP4 Stream',
                    'url': 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'
                },
                {
                    'name': 'Test HLS Stream',
                    'url': 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
                }
            ]
        else:
            # Get test URLs from playlist
            test_urls = self.get_test_urls(playlist_id)
            if not test_urls:
                print("⚠️  Using fallback test URLs")
                test_urls = [
                    {
                        'name': 'Test MP4 Stream',
                        'url': 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'
                    },
                    {
                        'name': 'Test HLS Stream',
                        'url': 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
                    }
                ]
        
        # Test proxy endpoints
        stream_success = self.test_proxy_stream_endpoint(test_urls)
        m3u8_success = self.test_proxy_m3u8_endpoint(test_urls)
        
        # Summary
        print("\n" + "=" * 50)
        print("🏁 Test Summary")
        print("=" * 50)
        
        if stream_success and m3u8_success:
            print("✅ All proxy tests PASSED")
            print("   - Video proxy endpoints are working correctly")
            print("   - CORS headers are properly set")
            print("   - Stream proxying is functional")
            print("   - M3U8 rewriting is working")
            return True
        else:
            print("❌ Some proxy tests FAILED")
            if not stream_success:
                print("   - /api/proxy/stream endpoint has issues")
            if not m3u8_success:
                print("   - /api/proxy/m3u8 endpoint has issues")
            return False

if __name__ == "__main__":
    tester = IPTVTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 Backend proxy functionality is working correctly!")
        exit(0)
    else:
        print("\n💥 Backend proxy functionality has issues that need attention!")
        exit(1)