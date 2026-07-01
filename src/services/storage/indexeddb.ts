import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface OpenSceneDB extends DBSchema {
  projects: {
    key: string;
    value: {
      id: string;
      name: string;
      description: string;
      createdAt: string;
      updatedAt: string;
      thumbnailUrl?: string;
      status: string;
      currentPhase: string;
      videoBrief?: unknown;
      storyboard?: unknown;
      workflowGraph?: unknown;
      creativePlan?: unknown;
      usageEvents?: unknown[];
      settings: unknown;
      versions: unknown[];
    };
    indexes: { 'by-updated': string };
  };
  chatMessages: {
    key: string;
    value: {
      id: string;
      projectId: string;
      role: string;
      content: string;
      timestamp: string;
      generativeUI?: unknown[];
      metadata?: Record<string, unknown>;
    };
    indexes: { 'by-project': string };
  };
  brandKits: {
    key: string;
    value: {
      id: string;
      name: string;
      brandName: string;
      colors: string[];
      logoUrls: string[];
      fonts: string[];
      toneOfVoice: string;
      productImageUrls: string[];
      targetAudience: string;
      ctaStyle: string;
      visualIdentity: string;
      brandRules: string;
      createdAt: string;
      updatedAt: string;
    };
  };
  characters: {
    key: string;
    value: {
      id: string;
      projectId: string;
      name: string;
      appearance: string;
      outfit: string;
      personality: string;
      voiceStyle: string;
      referenceImageUrls: string[];
      consistencyNotes: string;
      createdAt: string;
    };
    indexes: { 'by-project': string };
  };
  assets: {
    key: string;
    value: {
      id: string;
      projectId: string;
      name: string;
      type: string;
      url: string;
      thumbnailUrl?: string;
      mimeType: string;
      size: number;
      createdAt: string;
      metadata?: Record<string, unknown>;
      sceneId?: string;
    };
    indexes: { 'by-project': string; 'by-type': string };
  };
  appSettings: {
    key: string;
    value: {
      id: string;
      data: unknown;
      updatedAt: string;
    };
  };
  generationJobs: {
    key: string;
    value: {
      id: string;
      projectId: string;
      sceneId?: string;
      type: string;
      status: string;
      progress: number;
      startedAt?: string;
      completedAt?: string;
      error?: string;
      outputUrl?: string;
      metadata?: Record<string, unknown>;
    };
    indexes: { 'by-project': string; 'by-status': string };
  };
}

let dbInstance: IDBPDatabase<OpenSceneDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<OpenSceneDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OpenSceneDB>('openscene-db', 1, {
    upgrade(db) {
      // Projects store
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('by-updated', 'updatedAt');
      }

      // Chat messages store
      if (!db.objectStoreNames.contains('chatMessages')) {
        const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' });
        chatStore.createIndex('by-project', 'projectId');
      }

      // Brand kits store
      if (!db.objectStoreNames.contains('brandKits')) {
        db.createObjectStore('brandKits', { keyPath: 'id' });
      }

      // Characters store
      if (!db.objectStoreNames.contains('characters')) {
        const charStore = db.createObjectStore('characters', { keyPath: 'id' });
        charStore.createIndex('by-project', 'projectId');
      }

      // Assets store
      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-project', 'projectId');
        assetStore.createIndex('by-type', 'type');
      }

      // App settings store
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'id' });
      }

      // Generation jobs store
      if (!db.objectStoreNames.contains('generationJobs')) {
        const jobStore = db.createObjectStore('generationJobs', { keyPath: 'id' });
        jobStore.createIndex('by-project', 'projectId');
        jobStore.createIndex('by-status', 'status');
      }
    },
  });

  return dbInstance;
}

// Storage abstraction layer - can be replaced with cloud storage later
export const storage = {
  // Projects
  async getProject(id: string) {
    const db = await getDB();
    return db.get('projects', id);
  },

  async getAllProjects() {
    const db = await getDB();
    const all = await db.getAllFromIndex('projects', 'by-updated');
    return all.reverse(); // Most recent first
  },

  async saveProject(project: unknown) {
    const db = await getDB();
    const p = project as Record<string, unknown>;
    await db.put('projects', {
      ...(p as any),
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteProject(id: string) {
    const db = await getDB();
    await db.delete('projects', id);
    // Also delete related data
    const tx = db.transaction(
      ['chatMessages', 'characters', 'assets', 'generationJobs'],
      'readwrite'
    );
    const chatIndex = tx.objectStore('chatMessages').index('by-project');
    const charIndex = tx.objectStore('characters').index('by-project');
    const assetIndex = tx.objectStore('assets').index('by-project');
    const jobIndex = tx.objectStore('generationJobs').index('by-project');

    let chatCursor = await chatIndex.openCursor(id);
    while (chatCursor) { await chatCursor.delete(); chatCursor = await chatCursor.continue(); }
    let charCursor = await charIndex.openCursor(id);
    while (charCursor) { await charCursor.delete(); charCursor = await charCursor.continue(); }
    let assetCursor = await assetIndex.openCursor(id);
    while (assetCursor) { await assetCursor.delete(); assetCursor = await assetCursor.continue(); }
    let jobCursor = await jobIndex.openCursor(id);
    while (jobCursor) { await jobCursor.delete(); jobCursor = await jobCursor.continue(); }
    await tx.done;
  },

  // Chat Messages
  async getChatMessages(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex('chatMessages', 'by-project', projectId);
  },

  async saveChatMessage(message: unknown) {
    const db = await getDB();
    await db.put('chatMessages', message as any);
  },

  async deleteChatMessage(id: string) {
    const db = await getDB();
    await db.delete('chatMessages', id);
  },

  async clearChatMessages(projectId: string) {
    const db = await getDB();
    const tx = db.transaction('chatMessages', 'readwrite');
    const index = tx.objectStore('chatMessages').index('by-project');
    let cursor = await index.openCursor(projectId);
    while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
    await tx.done;
  },

  // Brand Kits
  async getBrandKits() {
    const db = await getDB();
    return db.getAll('brandKits');
  },

  async getBrandKit(id: string) {
    const db = await getDB();
    return db.get('brandKits', id);
  },

  async saveBrandKit(kit: unknown) {
    const db = await getDB();
    await db.put('brandKits', kit as any);
  },

  async deleteBrandKit(id: string) {
    const db = await getDB();
    await db.delete('brandKits', id);
  },

  // Characters
  async getCharacters(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex('characters', 'by-project', projectId);
  },

  async getCharacter(id: string) {
    const db = await getDB();
    return db.get('characters', id);
  },

  async saveCharacter(character: unknown) {
    const db = await getDB();
    await db.put('characters', character as any);
  },

  async deleteCharacter(id: string) {
    const db = await getDB();
    await db.delete('characters', id);
  },

  // Assets
  async getAssets(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex('assets', 'by-project', projectId);
  },

  async getAsset(id: string) {
    const db = await getDB();
    return db.get('assets', id);
  },

  async saveAsset(asset: unknown) {
    const db = await getDB();
    await db.put('assets', asset as any);
  },

  async deleteAsset(id: string) {
    const db = await getDB();
    await db.delete('assets', id);
  },

  // App Settings
  async getAppSettings(id: string) {
    const db = await getDB();
    const record = await db.get('appSettings', id);
    return record?.data;
  },

  async saveAppSettings(id: string, data: unknown) {
    const db = await getDB();
    await db.put('appSettings', {
      id,
      data,
      updatedAt: new Date().toISOString(),
    });
  },

  // Generation Jobs
  async getJobs(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex('generationJobs', 'by-project', projectId);
  },

  async saveJob(job: unknown) {
    const db = await getDB();
    await db.put('generationJobs', job as any);
  },

  async deleteJob(id: string) {
    const db = await getDB();
    await db.delete('generationJobs', id);
  },
};
