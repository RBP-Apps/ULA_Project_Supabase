'use client'

import { supabase } from './client'
import type { Contract } from '../types'
import type { Settings } from '../ula/types'

// Map frontend collection names to Supabase PostgreSQL table names
export const TABLE_MAP: Record<string, string> = {
  lots: 'lots',
  beneficiaries: 'beneficiaries',
  workOrders: 'work_orders',
  ips: 'installation_partners',
  warehouses: 'warehouses',
  items: 'item_masters',
  bomTemplates: 'bom_templates',
  purchaseOrders: 'purchase_orders',
  stockMoves: 'stock_moves',
  dispatches: 'dispatches',
  dockets: 'dockets',
  payments: 'payment_follow_ups',
  ipBills: 'ip_bills',
  cmcVisits: 'cmc_visits',
  tickets: 'complaint_tickets',
  cmcBills: 'cmc_bills',
  monitoring: 'monitoring_records',
  handovers: 'handover_records',
  roles: 'role_assignments',
  activity: 'activity_logs',
  contracts: 'contracts',
  settings: 'app_settings',
}

// Convert camelCase string to snake_case
function camelToSnake(str: string): string {
  if (str === 'by') return 'by_user'
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

// Convert snake_case string to camelCase
function snakeToCamel(str: string): string {
  if (str === 'by_user') return 'by'
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

// Check if string looks like an empty date/timestamp
function sanitizeValue(key: string, val: unknown): unknown {
  if (typeof val === 'string' && val.trim() === '') {
    // If field is a date or timestamp column, PostgreSQL requires NULL instead of empty string
    if (
      key.toLowerCase().endsWith('date') ||
      key.toLowerCase().endsWith('at') ||
      key === 'sim_expiry' ||
      key === 'warranty_deed_date'
    ) {
      return null
    }
  }
  return val
}

/** Transform frontend object to PostgreSQL snake_case record */
export function toDatabaseRecord<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key)
    result[snakeKey] = sanitizeValue(snakeKey, val)
  }
  return result
}

/** Transform PostgreSQL snake_case record to frontend camelCase object */
export function fromDatabaseRecord<T>(record: Record<string, any>): T {
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(record)) {
    const camelKey = snakeToCamel(key)
    result[camelKey] = val === null ? '' : val
  }
  return result as T
}

// -------------------------------------------------------------
// Core CRUD Operations
// -------------------------------------------------------------

export async function fetchCollection<T>(collection: string): Promise<T[]> {
  const table = TABLE_MAP[collection]
  if (!table) return []

  try {
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      console.warn(`Error fetching ${collection} from Supabase:`, error.message)
      return []
    }
    if (!data) return []
    return data.map((row) => {
      const rec = fromDatabaseRecord<T>(row) as any
      if (collection === 'items' && rec.code && !rec.id) {
        rec.id = rec.code
      }
      return rec
    })
  } catch (err) {
    console.warn(`Exception fetching ${collection}:`, err)
    return []
  }
}

export async function upsertRecord<T extends { id: string }>(
  collection: string,
  record: T
): Promise<boolean> {
  const table = TABLE_MAP[collection]
  if (!table) return false

  try {
    const dbRecord = toDatabaseRecord(record)
    // For item_masters, primary key is 'code' and table has no 'id' column
    if (collection === 'items') {
      if (!dbRecord.code && record.id) {
        dbRecord.code = record.id
      }
      delete dbRecord.id
    }
    let { error } = collection === 'items'
      ? await supabase.from(table).upsert(dbRecord, { onConflict: 'code' })
      : await supabase.from(table).upsert(dbRecord)

    if (error && error.message?.includes('allowed_pages')) {
      const { allowed_pages, ...cleanRecord } = dbRecord
      const retry = await supabase.from(table).upsert(cleanRecord)
      error = retry.error
    }
    if (error) {
      console.error(`Error saving to ${table} in Supabase:`, error.message, error)
      return false
    }
    return true
  } catch (err) {
    console.error(`Exception saving to ${table}:`, err)
    return false
  }
}

export async function upsertManyRecords<T extends { id: string }>(
  collection: string,
  records: T[]
): Promise<boolean> {
  const table = TABLE_MAP[collection]
  if (!table || records.length === 0) return false

  try {
    const dbRecords = records.map((r) => {
      const rec = toDatabaseRecord(r)
      if (collection === 'items') {
        if (!rec.code && r.id) rec.code = r.id
        delete rec.id
      }
      return rec
    })
    const { error } = collection === 'items'
      ? await supabase.from(table).upsert(dbRecords, { onConflict: 'code' })
      : await supabase.from(table).upsert(dbRecords)

    if (error) {
      console.error(`Error batch saving to ${table} in Supabase:`, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(`Exception batch saving to ${table}:`, err)
    return false
  }
}

export async function deleteRecord(collection: string, id: string): Promise<boolean> {
  const table = TABLE_MAP[collection]
  if (!table) return false

  try {
    const idColumn = collection === 'items' ? 'code' : 'id'
    const { error } = await supabase.from(table).delete().eq(idColumn, id)
    if (error) {
      console.error(`Error deleting from ${table}:`, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(`Exception deleting from ${table}:`, err)
    return false
  }
}

export async function deleteWhereRecords(
  collection: string,
  filterCol: string,
  filterVal: string
): Promise<boolean> {
  const table = TABLE_MAP[collection]
  if (!table) return false

  try {
    const snakeCol = camelToSnake(filterCol)
    const { error } = await supabase.from(table).delete().eq(snakeCol, filterVal)
    if (error) {
      console.error(`Error deleting where from ${table}:`, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(`Exception deleting where from ${table}:`, err)
    return false
  }
}

// -------------------------------------------------------------
// Settings Operations
// -------------------------------------------------------------

export async function fetchSettings(): Promise<Settings | null> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()

    if (error || !data) return null
    const res = fromDatabaseRecord<Settings>(data)
    res.rateCard = Array.isArray(res.rateCard) ? res.rateCard : []
    res.districts = Array.isArray(res.districts) ? res.districts : []
    res.circles = Array.isArray(res.circles) ? res.circles : []
    res.divisions = Array.isArray(res.divisions) ? res.divisions : []
    res.sla = res.sla && typeof res.sla === 'object' ? res.sla : ({} as any)
    return res
  } catch (err) {
    console.warn('Exception fetching settings from Supabase:', err)
    return null
  }
}

export async function saveSettings(settings: Settings): Promise<boolean> {
  try {
    const rawRecord = toDatabaseRecord(settings)
    const dbRecord: Record<string, any> = {
      id: 'default',
      rate_card: rawRecord.rate_card || [],
      sla: rawRecord.sla || {},
      districts: Array.isArray(rawRecord.districts) ? rawRecord.districts : [],
      circles: Array.isArray(rawRecord.circles) ? rawRecord.circles : [],
      divisions: Array.isArray(rawRecord.divisions) ? rawRecord.divisions : [],
      cmc_share_percent: Number(rawRecord.cmc_share_percent) || 20,
      min_pr_commissioning: Number(rawRecord.min_pr_commissioning) || 75,
      min_cuf_cmc: Number(rawRecord.min_cuf_cmc) || 19,
      photo_policy: rawRecord.photo_policy || 'strict',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('app_settings').upsert(dbRecord, { onConflict: 'id' })
    if (error) {
      console.error('Error saving settings to Supabase:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Exception saving settings to Supabase:', err)
    return false
  }
}

// -------------------------------------------------------------
// Contracts Operations
// -------------------------------------------------------------

export async function fetchContracts(): Promise<Contract[]> {
  try {
    const { data, error } = await supabase.from('contracts').select('*')
    if (error) {
      console.warn('Error fetching contracts from Supabase:', error.message)
      return []
    }
    return (data || []).map((row) => fromDatabaseRecord<Contract>(row))
  } catch (err) {
    console.warn('Exception fetching contracts from Supabase:', err)
    return []
  }
}

export async function saveContract(contract: Contract): Promise<boolean> {
  try {
    const dbRecord = toDatabaseRecord(contract)
    const { error } = await supabase.from('contracts').upsert(dbRecord)
    if (error) {
      console.error('Error saving contract to Supabase:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Exception saving contract to Supabase:', err)
    return false
  }
}

export async function deleteContract(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('contracts').delete().eq('id', id)
    if (error) {
      console.error('Error deleting contract from Supabase:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Exception deleting contract from Supabase:', err)
    return false
  }
}

// -------------------------------------------------------------
// Users Operations (Supabase app_users table)
// -------------------------------------------------------------

export interface AppUserRow {
  id: string
  name: string
  email: string
  role: string
  entity: string
  mobile?: string
  avatar?: string
  active?: boolean
  allowedPages?: string[]
}

export async function fetchAppUsers(): Promise<AppUserRow[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Error fetching app_users from Supabase:', error.message)
      return []
    }
    return (data || []).map((u) => fromDatabaseRecord<AppUserRow>(u))
  } catch (err) {
    console.warn('Exception fetching app_users:', err)
    return []
  }
}

export async function saveAppUser(user: Record<string, any>): Promise<boolean> {
  try {
    const dbRecord = toDatabaseRecord(user)
    const cleanEmail = (dbRecord.email || '').trim().toLowerCase()
    if (!cleanEmail) return false

    // Check if user already exists in database
    const { data: existing } = await supabase
      .from('app_users')
      .select('id, email, password_hash')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (existing) {
      // It's an update: do NOT overwrite password_hash if not provided by user
      const updateData: Record<string, any> = { ...dbRecord }
      delete updateData.id // Preserve original database primary key
      if (!updateData.password_hash) {
        delete updateData.password_hash
      }

      let { error } = await supabase
        .from('app_users')
        .update(updateData)
        .eq('email', cleanEmail)

      if (error && error.message?.includes('allowed_pages')) {
        delete updateData.allowed_pages
        const retry = await supabase
          .from('app_users')
          .update(updateData)
          .eq('email', cleanEmail)
        error = retry.error
      }

      if (error) {
        console.error('Error updating app_user in Supabase:', error.message)
        return false
      }
      return true
    } else {
      // It's a new user insert
      const insertData: Record<string, any> = { ...dbRecord }
      if (!insertData.password_hash) {
        insertData.password_hash = 'admin123'
      }

      let { error } = await supabase.from('app_users').insert(insertData)
      if (error && error.message?.includes('allowed_pages')) {
        delete insertData.allowed_pages
        const retry = await supabase.from('app_users').insert(insertData)
        error = retry.error
      }

      if (error) {
        console.error('Error inserting app_user into Supabase:', error.message)
        return false
      }
      return true
    }
  } catch (err) {
    console.error('Exception saving app_user:', err)
    return false
  }
}

export async function deleteAppUser(email: string): Promise<boolean> {
  try {
    const clean = email.trim().toLowerCase()
    const { error } = await supabase.from('app_users').delete().eq('email', clean)
    if (error) {
      console.error('Error deleting app_user from Supabase:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Exception deleting app_user:', err)
    return false
  }
}

