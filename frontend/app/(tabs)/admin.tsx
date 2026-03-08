import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/contexts/AuthContext';
import api from '../../src/services/api';

interface Stats {
  totalUsers: number;
  totalPlaylists: number;
  totalChannels: number;
  totalMovies: number;
  totalSeries: number;
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalPlaylists: 0,
    totalChannels: 0,
    totalMovies: 0,
    totalSeries: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is admin (you can add this field to your user model)
  const isAdmin = user?.email === 'admin@iptv.com'; // Simple check - improve this in production

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
    }
  }, [isAdmin]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      // For now, we'll calculate stats from user's own data
      // In production, add admin-only endpoints in backend
      const playlistsRes = await api.get('/playlists');
      const playlists = Array.isArray(playlistsRes.data) ? playlistsRes.data : [];
      
      const totalChannels = playlists.reduce((sum: number, pl: any) => sum + (pl.channel_count || 0), 0);
      const totalMovies = playlists.reduce((sum: number, pl: any) => sum + (pl.movie_count || 0), 0);
      const totalSeries = playlists.reduce((sum: number, pl: any) => sum + (pl.series_count || 0), 0);

      setStats({
        totalUsers: 1, // Placeholder - add admin endpoint for this
        totalPlaylists: playlists.length,
        totalChannels,
        totalMovies,
        totalSeries,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      Alert.alert('Fel', 'Kunde inte hämta statistik');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={64} color={colors.textMuted} />
          <Text style={[styles.noAccessText, { color: colors.text }]}>
            Åtkomst nekad
          </Text>
          <Text style={[styles.noAccessSubtext, { color: colors.textMuted }]}>
            Du har inte administratörsbehörighet
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Admin Panel
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
          Streamify Administration
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon="people"
          title="Användare"
          value={stats.totalUsers}
          color="#3b82f6"
          colors={colors}
        />
        <StatCard
          icon="list"
          title="Spellistor"
          value={stats.totalPlaylists}
          color="#8b5cf6"
          colors={colors}
        />
        <StatCard
          icon="tv"
          title="Kanaler"
          value={stats.totalChannels}
          color="#10b981"
          colors={colors}
        />
        <StatCard
          icon="film"
          title="Filmer"
          value={stats.totalMovies}
          color="#f59e0b"
          colors={colors}
        />
        <StatCard
          icon="albums"
          title="Serier"
          value={stats.totalSeries}
          color="#ef4444"
          colors={colors}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Snabbåtgärder
        </Text>
        
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.surface }]}
          onPress={() => Alert.alert('Info', 'Funktionen kommer snart')}
        >
          <Ionicons name="people-outline" size={24} color={colors.primary} />
          <View style={styles.actionContent}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>
              Hantera användare
            </Text>
            <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>
              Se och hantera alla användare
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.surface }]}
          onPress={() => Alert.alert('Info', 'Funktionen kommer snart')}
        >
          <Ionicons name="server-outline" size={24} color={colors.primary} />
          <View style={styles.actionContent}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>
              Server-inställningar
            </Text>
            <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>
              Konfigurera proxy och caching
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.surface }]}
          onPress={() => Alert.alert('Info', 'Funktionen kommer snart')}
        >
          <Ionicons name="bar-chart-outline" size={24} color={colors.primary} />
          <View style={styles.actionContent}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>
              Användningsstatistik
            </Text>
            <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>
              Se detaljerad användning och trender
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.surface }]}
          onPress={() => Alert.alert('Info', 'Funktionen kommer snart')}
        >
          <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
          <View style={styles.actionContent}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>
              Backup & Återställning
            </Text>
            <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>
              Hantera databas-backuper
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          Streamify Admin v1.0.0
        </Text>
      </View>
    </ScrollView>
  );
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: number;
  color: string;
  colors: any;
}

function StatCard({ icon, title, value, color, colors }: StatCardProps) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={[styles.statTitle, { color: colors.textMuted }]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    alignItems: 'center',
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noAccessText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  noAccessSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionContent: {
    flex: 1,
    marginLeft: 16,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
  },
});
