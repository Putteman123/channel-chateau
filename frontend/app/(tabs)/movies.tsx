import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import api from '../../src/services/api';

interface Movie {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  plot?: string;
  rating?: string;
}

interface Playlist {
  id: string;
  name: string;
  movie_count: number;
}

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export default function MoviesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalMovies, setTotalMovies] = useState(0);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
      loadFavorites();
    }, [])
  );

  useEffect(() => {
    if (selectedPlaylist) {
      setPage(0);
      setMovies([]);
      loadMovies(0);
      loadGroups();
    }
  }, [selectedPlaylist, selectedGroup, searchQuery]);

  const loadPlaylists = async () => {
    try {
      const response = await api.get('/api/playlists');
      const playlistsWithMovies = response.data.filter((p: Playlist) => p.movie_count > 0);
      setPlaylists(playlistsWithMovies);
      if (playlistsWithMovies.length > 0 && !selectedPlaylist) {
        setSelectedPlaylist(playlistsWithMovies[0].id);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMovies = async (pageNum: number) => {
    if (!selectedPlaylist) return;
    
    try {
      const params: any = {
        skip: pageNum * PAGE_SIZE,
        limit: PAGE_SIZE
      };
      if (searchQuery) params.search = searchQuery;
      if (selectedGroup) params.group = selectedGroup;
      
      const response = await api.get(`/api/playlists/${selectedPlaylist}/movies`, { params });
      const newMovies = response.data.items || response.data;
      setTotalMovies(response.data.total || newMovies.length);
      
      if (pageNum === 0) {
        setMovies(newMovies);
      } else {
        setMovies(prev => [...prev, ...newMovies]);
      }
    } catch (error) {
      console.error('Error loading movies:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadGroups = async () => {
    if (!selectedPlaylist) return;
    
    try {
      const response = await api.get(`/api/playlists/${selectedPlaylist}/groups/movie`);
      setGroups(response.data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const response = await api.get('/api/favorites?content_type=movie');
      const favUrls = new Set(response.data.map((f: any) => f.channel_url));
      setFavorites(favUrls);
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const toggleFavorite = async (movie: Movie) => {
    const isFav = favorites.has(movie.url);
    
    try {
      if (isFav) {
        await api.delete(`/api/favorites/by-url/${encodeURIComponent(movie.url)}`);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(movie.url);
          return newSet;
        });
      } else {
        await api.post('/api/favorites', {
          channel_name: movie.name,
          channel_url: movie.url,
          channel_logo: movie.logo,
          channel_group: movie.group,
          content_type: 'movie',
        });
        setFavorites(prev => new Set([...prev, movie.url]));
      }
    } catch (error: any) {
      Alert.alert('Fel', error.response?.data?.detail || 'Kunde inte uppdatera favoriter');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPlaylists(), loadFavorites()]);
    if (selectedPlaylist) {
      setPage(0);
      await loadMovies(0);
    }
    setRefreshing(false);
  }, [selectedPlaylist]);

  const loadMore = () => {
    if (isLoadingMore || movies.length >= totalMovies) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    loadMovies(nextPage);
  };

  const playMovie = (movie: Movie) => {
    router.push({
      pathname: '/player',
      params: {
        url: movie.url,
        name: movie.name,
        logo: movie.logo || '',
      },
    });
  };

  const renderMovie = ({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={[styles.movieItem, { backgroundColor: colors.surface }]}
      onPress={() => playMovie(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, { backgroundColor: colors.surfaceVariant }]}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons name="film" size={32} color={colors.textMuted} />
          </View>
        )}
        <TouchableOpacity
          style={[styles.favoriteOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          onPress={() => toggleFavorite(item)}
        >
          <Ionicons
            name={favorites.has(item.url) ? 'heart' : 'heart-outline'}
            size={20}
            color={favorites.has(item.url) ? '#ff4444' : '#ffffff'}
          />
        </TouchableOpacity>
        <View style={styles.playOverlay}>
          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
        </View>
      </View>
      <Text style={[styles.movieTitle, { color: colors.text }]} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderGroupFilter = () => (
    <FlatList
      horizontal
      data={[null, ...groups]}
      keyExtractor={(item) => item || 'all'}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.groupList}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.groupChip,
            {
              backgroundColor: selectedGroup === item ? colors.primary : colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setSelectedGroup(item)}
        >
          <Text
            style={[
              styles.groupChipText,
              { color: selectedGroup === item ? '#ffffff' : colors.text },
            ]}
            numberOfLines={1}
          >
            {item || 'Alla'}
          </Text>
        </TouchableOpacity>
      )}
    />
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (playlists.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Inga filmer
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Lägg till en spellista med filmer för att börja titta
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Filmer</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {totalMovies} filmer
        </Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Sök filmer..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {groups.length > 0 && renderGroupFilter()}

      <FlatList
        data={movies}
        keyExtractor={(item) => item.id}
        renderItem={renderMovie}
        numColumns={3}
        contentContainerStyle={styles.gridContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={[styles.emptyListText, { color: colors.textSecondary }]}>
              Inga filmer hittades
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
  },
  groupList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  groupChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    maxWidth: 150,
  },
  groupChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  gridContent: {
    paddingHorizontal: 12,
  },
  movieItem: {
    width: POSTER_WIDTH,
    marginHorizontal: 4,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  posterContainer: {
    width: '100%',
    height: POSTER_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  emptyList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 16,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
