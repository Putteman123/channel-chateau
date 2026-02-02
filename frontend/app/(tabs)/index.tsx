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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import api from '../../src/services/api';

interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

interface Playlist {
  id: string;
  name: string;
  channel_count: number;
}

export default function ChannelsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPlaylists();
    loadFavorites();
  }, []);

  useEffect(() => {
    if (selectedPlaylist) {
      loadChannels();
      loadGroups();
    }
  }, [selectedPlaylist, selectedGroup, searchQuery]);

  const loadPlaylists = async () => {
    try {
      const response = await api.get('/api/playlists');
      setPlaylists(response.data);
      if (response.data.length > 0 && !selectedPlaylist) {
        setSelectedPlaylist(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChannels = async () => {
    if (!selectedPlaylist) return;
    
    try {
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedGroup) params.group = selectedGroup;
      
      const response = await api.get(`/api/playlists/${selectedPlaylist}/channels`, { params });
      setChannels(response.data);
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  };

  const loadGroups = async () => {
    if (!selectedPlaylist) return;
    
    try {
      const response = await api.get(`/api/playlists/${selectedPlaylist}/groups`);
      setGroups(response.data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const response = await api.get('/api/favorites');
      const favUrls = new Set(response.data.map((f: any) => f.channel_url));
      setFavorites(favUrls);
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const toggleFavorite = async (channel: Channel) => {
    const isFav = favorites.has(channel.url);
    
    try {
      if (isFav) {
        await api.delete(`/api/favorites/by-url/${encodeURIComponent(channel.url)}`);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(channel.url);
          return newSet;
        });
      } else {
        await api.post('/api/favorites', {
          channel_name: channel.name,
          channel_url: channel.url,
          channel_logo: channel.logo,
          channel_group: channel.group,
        });
        setFavorites(prev => new Set([...prev, channel.url]));
      }
    } catch (error: any) {
      Alert.alert('Fel', error.response?.data?.detail || 'Kunde inte uppdatera favoriter');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPlaylists(), loadFavorites()]);
    if (selectedPlaylist) {
      await loadChannels();
    }
    setRefreshing(false);
  }, [selectedPlaylist]);

  const playChannel = (channel: Channel) => {
    router.push({
      pathname: '/player',
      params: {
        url: channel.url,
        name: channel.name,
        logo: channel.logo || '',
      },
    });
  };

  const renderChannel = ({ item }: { item: Channel }) => (
    <TouchableOpacity
      style={[styles.channelItem, { backgroundColor: colors.surface }]}
      onPress={() => playChannel(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.channelLogo, { backgroundColor: colors.surfaceVariant }]}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.logoImage} resizeMode="contain" />
        ) : (
          <Ionicons name="tv" size={24} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.group && (
          <Text style={[styles.channelGroup, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.group}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.favoriteButton}
        onPress={() => toggleFavorite(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name={favorites.has(item.url) ? 'heart' : 'heart-outline'}
          size={24}
          color={favorites.has(item.url) ? colors.error : colors.textMuted}
        />
      </TouchableOpacity>
      <Ionicons name="play-circle" size={32} color={colors.primary} />
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
          <Ionicons name="list" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Inga spellistor
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Lägg till en M3U-spellista för att börja titta på kanaler
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/(tabs)/playlists')}
          >
            <Ionicons name="add" size={24} color="#ffffff" />
            <Text style={styles.addButtonText}>Lägg till spellista</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Kanaler</Text>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Sök kanaler..."
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
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={renderChannel}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={[styles.emptyListText, { color: colors.textSecondary }]}>
              Inga kanaler hittades
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
  },
  groupChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  channelLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  channelInfo: {
    flex: 1,
    marginLeft: 12,
  },
  channelName: {
    fontSize: 16,
    fontWeight: '600',
  },
  channelGroup: {
    fontSize: 13,
    marginTop: 2,
  },
  favoriteButton: {
    padding: 8,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 16,
  },
});
