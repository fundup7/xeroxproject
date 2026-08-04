const mongoose = require('mongoose');
const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

// MongoDB Schema for storing Baileys session keys
const authSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  data: { type: String, required: true }
}, { timestamps: true });

const AuthModel = mongoose.model('BaileysAuth', authSchema);

/**
 * Custom MongoDB AuthState Adapter for Baileys
 * Encodes keys using BufferJSON to preserve Binary/Buffer structures in MongoDB.
 */
async function useMongoAuthState() {
  const readData = async (id) => {
    try {
      const doc = await AuthModel.findById(id);
      if (!doc) return null;
      return JSON.parse(doc.data, BufferJSON.reviver);
    } catch (error) {
      console.error(`[Auth DB] Error reading key "${id}":`, error.message);
      return null;
    }
  };

  const writeData = async (id, data) => {
    try {
      const jsonStr = JSON.stringify(data, BufferJSON.replacer);
      await AuthModel.findByIdAndUpdate(
        id,
        { data: jsonStr },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`[Auth DB] Error writing key "${id}":`, error.message);
    }
  };

  const removeData = async (id) => {
    try {
      await AuthModel.findByIdAndDelete(id);
    } catch (error) {
      console.error(`[Auth DB] Error deleting key "${id}":`, error.message);
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) {
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(key, value));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearState: async () => {
      try {
        await AuthModel.deleteMany({});
        console.log('[Auth DB] Successfully cleared session data from MongoDB.');
      } catch (err) {
        console.error('[Auth DB] Error clearing session data:', err.message);
      }
    }
  };
}

module.exports = { useMongoAuthState };
