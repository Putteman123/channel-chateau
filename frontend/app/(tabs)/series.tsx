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
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import api from '../../src/services/api';

interface Series {
  id: string;
  series_id?: number;
  name: string;
  logo?: string;
  group?: string;
  plot?: string;
  cast?: string;
  genre?: string;
  rating?: string;
}

interface Episode {
  id: string;
  episode_num: number;
  title: string;
  plot?: string;
  duration?: string;
  url: string;
}

interface Season {
  season_number: number;
  episodes: Episode[];
}

interface Playlist {
  id: string;
  name: string;
  series_count: number;
  playlist_type: string;
}

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export default function SeriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [playlistType, setPlaylistType] = useState<string>('m3u');
  const [series, setSeries] = useState<Series[]>([]);
  const [totalSeries, setTotalSeries] = useState(0);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;
  
  // Episode modal state
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [showEpisodesModal, setShowEpisodesModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
      loadFavorites();
    }, [])
  );

  useEffect(() => {
    if (selectedPlaylist) {
      setPage(0);
      setSeries([]);
      loadSeries(0);
      loadGroups();
    }
  }, [selectedPlaylist, selectedGroup, searchQuery]);

  const loadPlaylists = async () => {
    try {
      const response = await api.get('/api/playlists');
      const playlistsWithSeries = response.data.filter((p: Playlist) => p.series_count > 0);
      setPlaylists(playlistsWithSeries);
      if (playlistsWithSeries.length > 0 && !selectedPlaylist) {
        setSelectedPlaylist(playlistsWithSeries[0].id);
        setPlaylistType(playlistsWithSeries[0].playlist_type);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSeries = async (pageNum: number) => {
    if (!selectedPlaylist) return;
    
    try {
      const params: any = {
        skip: pageNum * PAGE_SIZE,
        limit: PAGE_SIZE
      };
      if (searchQuery) params.search = searchQuery;
      if (selectedGroup) params.group = selectedGroup;
      
      const response = await api.get(`/api/playlists/${selectedPlaylist}/series`, { params });
      const newSeries = response.data.items || response.data;
      setTotalSeries(response.data.total || newSeries.length);
      
      if (pageNum === 0) {
        setSeries(newSeries);
      } else {
        setSeries(prev => [...prev, ...newSeries]);
      }
    } catch (error) {
      console.error('Error loading series:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadGroups = async () => {
    if (!selectedPlaylist) return;
    
    try {
      const response = await api.get(`/api/playlists/${selectedPlaylist}/groups/series`);
      setGroups(response.data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const response = await api.get('/api/favorites?content_type=series');
      const favIds = new Set(response.data.map((f: any) => f.channel_url));
      setFavorites(favIds);
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const loadEpisodes = async (seriesItem: Series) => {
    if (playlistType !== 'xtream') {
      // For M3U, just play the URL directly if available
      if ((seriesItem as any).url) {
        router.push({
          pathname: '/player',
          params: {
            url: (seriesItem as any).url,
            name: seriesItem.name,
            logo: seriesItem.logo || '',
          },
        });
      } else {
        Alert.alert('Info', 'Avsnitt finns endast för Xtream-spellistor');
      }
      return;
    }
    
    setSelectedSeries(seriesItem);
    setIsLoadingEpisodes(true);
    setShowEpisodesModal(true);
    
    try {
      const response = await api.get(
        `/api/playlists/${selectedPlaylist}/series/${seriesItem.series_id || seriesItem.id}/episodes`
      );
      setSeasons(response.data.seasons || []);
      if (response.data.seasons?.length > 0) {
        setSelectedSeason(response.data.seasons[0].season_number);
      }
    } catch (error: any) {
      console.error('Error loading episodes:', error);
      Alert.alert('Fel', 'Kunde inte ladda avsnitt');
      setShowEpisodesModal(false);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const playEpisode = (episode: Episode) => {
    setShowEpisodesModal(false);
    router.push({
      pathname: '/player',
      params: {
        url: episode.url,
        name: `${selectedSeries?.name} - ${episode.title}`,
        logo: selectedSeries?.logo || '',
      },
    });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPlaylists(), loadFavorites()]);
    if (selectedPlaylist) {
      setPage(0);
      await loadSeries(0);
    }
    setRefreshing(false);
  }, [selectedPlaylist]);

  const loadMore = () => {
    if (isLoadingMore || series.length >= totalSeries) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    loadSeries(nextPage);
  };

  const renderSeries = ({ item }: { item: Series }) => (
    <TouchableOpacity
      style={[styles.seriesItem, { backgroundColor: colors.surface }]}
      onPress={() => loadEpisodes(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, { backgroundColor: colors.surfaceVariant }]}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons name="albums" size={32} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.playOverlay}>
          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
        </View>
      </View>
      <Text style={[styles.seriesTitle, { color: colors.text }]} numberOfLines={2}>
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

  const renderEpisodesModal = () => {
    const currentSeason = seasons.find(s => s.season_number === selectedSeason);
    const episodes = currentSeason?.episodes || [];
    
    return (
      <Modal
        visible={showEpisodesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEpisodesModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                  {selectedSeries?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowEpisodesModal(false)}>
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>

            {isLoadingEpisodes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Laddar avsnitt...
                </Text>
              </View>
            ) : (
              <>
                {seasons.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.seasonList}
                  >
                    {seasons.map(season => (
                      <TouchableOpacity
                        key={season.season_number}
                        style={[
                          styles.seasonChip,
                          {
                            backgroundColor: selectedSeason === season.season_number
                              ? colors.primary
                              : colors.surface,
                          },
                        ]}
                        onPress={() => setSelectedSeason(season.season_number)}
                      >
                        <Text
                          style={[
                            styles.seasonChipText,
                            {
                              color: selectedSeason === season.season_number
                                ? '#ffffff'
                                : colors.text,
                            },
                          ]}
                        >
                          Säsong {season.season_number}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <FlatList
                  data={episodes}
                  keyExtractor={(item) => item.id || String(item.episode_num)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.episodeItem, { backgroundColor: colors.surface }]}
                      onPress={() => playEpisode(item)}
                    >
                      <View style={styles.episodeNumber}>
                        <Text style={[styles.episodeNumText, { color: colors.primary }]}>
                          {item.episode_num}
                        </Text>
                      </View>
                      <View style={styles.episodeInfo}>
                        <Text style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.duration && (
                          <Text style={[styles.episodeDuration, { color: colors.textSecondary }]}>
                            {item.duration}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="play-circle" size={32} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.episodeList}
                  ListEmptyComponent={
                    <Text style={[styles.noEpisodes, { color: colors.textSecondary }]}>
                      Inga avsnitt hittades
                    </Text>
                  }
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

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
          <Ionicons name="albums-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Inga serier
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Lägg till en spellista med serier för att börja titta
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Serier</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {totalSeries} serier
        </Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Sök serier..."
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
        data={series}
        keyExtractor={(item) => item.id}
        renderItem={renderSeries}
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
              Inga serier hittades
            </Text>
          </View>
        }
      />

      {renderEpisodesModal()}
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
  seriesItem: {
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
  seriesTitle: {
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  modalTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  seasonList: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  seasonChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  episodeList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  episodeNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(98, 0, 238, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeNumText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  episodeDuration: {
    fontSize: 13,
    marginTop: 2,
  },
  noEpisodes: {
    textAlign: 'center',
    padding: 20,
    fontSize: 16,
  },
});
