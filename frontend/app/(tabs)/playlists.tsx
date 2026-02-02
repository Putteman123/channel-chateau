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
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/hooks/useTheme';
import api from '../../src/services/api';

interface Playlist {
  id: string;
  name: string;
  channel_count: number;
  created_at: string;
}

export default function PlaylistsScreen() {
  const { colors } = useTheme();
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMethod, setAddMethod] = useState<'url' | 'file' | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
    }, [])
  );

  const loadPlaylists = async () => {
    try {
      const response = await api.get('/api/playlists');
      setPlaylists(response.data);
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPlaylists();
    setRefreshing(false);
  }, []);

  const handleAddFromUrl = async () => {
    if (!playlistName.trim()) {
      Alert.alert('Fel', 'Ange ett namn för spellistan');
      return;
    }
    if (!playlistUrl.trim()) {
      Alert.alert('Fel', 'Ange en URL till spellistan');
      return;
    }

    setIsAdding(true);
    try {
      await api.post('/api/playlists', {
        name: playlistName.trim(),
        url: playlistUrl.trim(),
      });
      Alert.alert('Klart', 'Spellistan har lagts till');
      setShowAddModal(false);
      setAddMethod(null);
      setPlaylistName('');
      setPlaylistUrl('');
      loadPlaylists();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Kunde inte lägga till spellistan';
      Alert.alert('Fel', message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddFromFile = async () => {
    if (!playlistName.trim()) {
      Alert.alert('Fel', 'Ange ett namn för spellistan');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      
      setIsAdding(true);

      // Read file content
      const response = await fetch(file.uri);
      const content = await response.text();

      await api.post('/api/playlists', {
        name: playlistName.trim(),
        content: content,
      });

      Alert.alert('Klart', 'Spellistan har lagts till');
      setShowAddModal(false);
      setAddMethod(null);
      setPlaylistName('');
      loadPlaylists();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Kunde inte läsa filen';
      Alert.alert('Fel', message);
    } finally {
      setIsAdding(false);
    }
  };

  const deletePlaylist = async (playlist: Playlist) => {
    Alert.alert(
      'Ta bort spellista',
      `Vill du ta bort "${playlist.name}"?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/playlists/${playlist.id}`);
              setPlaylists(prev => prev.filter(p => p.id !== playlist.id));
            } catch (error) {
              Alert.alert('Fel', 'Kunde inte ta bort spellistan');
            }
          },
        },
      ]
    );
  };

  const renderPlaylist = ({ item }: { item: Playlist }) => (
    <View style={[styles.playlistItem, { backgroundColor: colors.surface }]}>
      <View style={[styles.playlistIcon, { backgroundColor: colors.primary }]}>
        <Ionicons name="list" size={24} color="#ffffff" />
      </View>
      <View style={styles.playlistInfo}>
        <Text style={[styles.playlistName, { color: colors.text }]}>
          {item.name}
        </Text>
        <Text style={[styles.playlistChannels, { color: colors.textSecondary }]}>
          {item.channel_count} kanal{item.channel_count !== 1 ? 'er' : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deletePlaylist(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  const renderAddModal = () => (
    <Modal
      visible={showAddModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowAddModal(false);
        setAddMethod(null);
        setPlaylistName('');
        setPlaylistUrl('');
      }}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Lägg till spellista
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setAddMethod(null);
                  setPlaylistName('');
                  setPlaylistUrl('');
                }}
              >
                <Ionicons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {!addMethod ? (
                <View style={styles.methodSelection}>
                  <TouchableOpacity
                    style={[styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => setAddMethod('url')}
                  >
                    <Ionicons name="link" size={32} color={colors.primary} />
                    <Text style={[styles.methodTitle, { color: colors.text }]}>Från URL</Text>
                    <Text style={[styles.methodDesc, { color: colors.textSecondary }]}>
                      Ange länk till M3U-spellista
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => setAddMethod('file')}
                  >
                    <Ionicons name="document" size={32} color={colors.primary} />
                    <Text style={[styles.methodTitle, { color: colors.text }]}>Från fil</Text>
                    <Text style={[styles.methodDesc, { color: colors.textSecondary }]}>
                      Ladda upp M3U-fil från enhet
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.addForm}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setAddMethod(null)}
                  >
                    <Ionicons name="arrow-back" size={24} color={colors.primary} />
                    <Text style={[styles.backText, { color: colors.primary }]}>Tillbaka</Text>
                  </TouchableOpacity>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>Namn på spellista</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    placeholder="T.ex. Min IPTV"
                    placeholderTextColor={colors.textMuted}
                    value={playlistName}
                    onChangeText={setPlaylistName}
                  />

                  {addMethod === 'url' && (
                    <>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>URL till M3U-spellista</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                        placeholder="https://example.com/playlist.m3u"
                        placeholderTextColor={colors.textMuted}
                        value={playlistUrl}
                        onChangeText={setPlaylistUrl}
                        keyboardType="url"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </>
                  )}

                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: colors.primary }]}
                    onPress={addMethod === 'url' ? handleAddFromUrl : handleAddFromFile}
                    disabled={isAdding}
                  >
                    {isAdding ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons
                          name={addMethod === 'url' ? 'add' : 'document-attach'}
                          size={24}
                          color="#ffffff"
                        />
                        <Text style={styles.submitButtonText}>
                          {addMethod === 'url' ? 'Lägg till' : 'Välj fil'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

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
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Spellistor</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {playlists.length} spellista{playlists.length !== 1 ? 'or' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addHeaderButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaylist}
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
            <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Inga spellistor
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Lägg till en M3U-spellista för att börja titta på kanaler
            </Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
              <Text style={styles.addButtonText}>Lägg till spellista</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {renderAddModal()}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    flexGrow: 1,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  playlistIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
    marginLeft: 16,
  },
  playlistName: {
    fontSize: 17,
    fontWeight: '600',
  },
  playlistChannels: {
    fontSize: 14,
    marginTop: 4,
  },
  deleteButton: {
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  methodSelection: {
    gap: 16,
  },
  methodButton: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  methodDesc: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  addForm: {
    paddingBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    marginLeft: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});
