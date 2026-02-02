import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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

interface Favorite {
  id: string;
  channel_name: string;
  channel_url: string;
  channel_logo?: string;
  channel_group?: string;
  content_type: string;
}

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export default function FavoritesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'movie' | 'series'>('live');

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [])
  );

  const loadFavorites = async () => {
    try {
      const response = await api.get('/api/favorites');
      setFavorites(response.data);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFavorite = async (favorite: Favorite) => {
    Alert.alert(
      'Ta bort favorit',
      `Vill du ta bort ${favorite.channel_name} från favoriter?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/favorites/${favorite.id}`);
              setFavorites(prev => prev.filter(f => f.id !== favorite.id));
            } catch (error: any) {
              Alert.alert('Fel', 'Kunde inte ta bort favorit');
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFavorites();
    setRefreshing(false);
  }, []);

  const playContent = (favorite: Favorite) => {
    router.push({
      pathname: '/player',
      params: {
        url: favorite.channel_url,
        name: favorite.channel_name,
        logo: favorite.channel_logo || '',
      },
    });
  };

  const filteredFavorites = favorites.filter(f => f.content_type === activeTab);

  const renderChannelItem = ({ item }: { item: Favorite }) => (
    <TouchableOpacity
      style={[styles.channelItem, { backgroundColor: colors.surface }]}
      onPress={() => playContent(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.channelLogo, { backgroundColor: colors.surfaceVariant }]}>
        {item.channel_logo ? (
          <Image source={{ uri: item.channel_logo }} style={styles.logoImage} resizeMode="contain" />
        ) : (
          <Ionicons name="tv" size={24} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
          {item.channel_name}
        </Text>
        {item.channel_group && (
          <Text style={[styles.channelGroup, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.channel_group}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeFavorite(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="heart" size={24} color={colors.error} />
      </TouchableOpacity>
      <Ionicons name="play-circle" size={32} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderGridItem = ({ item }: { item: Favorite }) => (
    <TouchableOpacity
      style={[styles.gridItem, { backgroundColor: colors.surface }]}
      onPress={() => playContent(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, { backgroundColor: colors.surfaceVariant }]}>
        {item.channel_logo ? (
          <Image source={{ uri: item.channel_logo }} style={styles.poster} resizeMode="cover" />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons name={activeTab === 'movie' ? 'film' : 'albums'} size={32} color={colors.textMuted} />
          </View>
        )}
        <TouchableOpacity
          style={[styles.favoriteOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          onPress={() => removeFavorite(item)}
        >
          <Ionicons name="heart" size={20} color="#ff4444" />
        </TouchableOpacity>
        <View style={styles.playOverlay}>
          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
        </View>
      </View>
      <Text style={[styles.gridTitle, { color: colors.text }]} numberOfLines={2}>
        {item.channel_name}
      </Text>
    </TouchableOpacity>
  );

  const tabs = [
    { key: 'live', label: 'TV', icon: 'tv' },
    { key: 'movie', label: 'Filmer', icon: 'film' },
    { key: 'series', label: 'Serier', icon: 'albums' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Favoriter</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {filteredFavorites.length} {activeTab === 'live' ? 'kanaler' : activeTab === 'movie' ? 'filmer' : 'serier'}
        </Text>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: colors.surface }]}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? '#ffffff' : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? '#ffffff' : colors.textMuted },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'live' ? (
        <FlatList
          data={filteredFavorites}
          keyExtractor={(item) => item.id}
          renderItem={renderChannelItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Inga favoriter
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Tryck på hjärtat vid en kanal för att lägga till den här
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredFavorites}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Inga favoriter
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Tryck på hjärtat vid en {activeTab === 'movie' ? 'film' : 'serie'} för att lägga till den här
              </Text>
            </View>
          }
        />
      )}
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
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    flexGrow: 1,
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
  removeButton: {
    padding: 8,
  },
  gridContent: {
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  gridItem: {
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
  gridTitle: {
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
});
