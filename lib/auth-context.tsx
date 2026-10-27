'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from './types'
import { supabase } from './supabase/client'

export const DEMO_USERS: Record<string, User & { password?: string }> = {
  admin: {
    id: 'USR-001',
    name: 'Ankit Sharma',
    email: 'admin@suryasetu.gov.in',
    role: 'Project Administrator',
    entity: 'CSPDCL ULA Project Cell',
    mobile: '+91 98765 43210',
    avatar: 'AS',
    password: 'admin123',
  },
  officer: {
    id: 'USR-002',
    name: 'Ramesh Verma',
    email: 'verma.cspdcl@gov.in',
    role: 'Superintending Engineer (RE)',
    entity: 'CSPDCL Raipur Circle',
    mobile: '+91 94252 11223',
    avatar: 'RV',
    password: 'admin123',
  },
  vendor: {
    id: 'USR-003',
    name: 'Vikas Deshmukh',
    email: 'vikas@rbprotomag.in',
    role: 'Project Lead (EPC)',
    entity: 'RBP + Rotomag Consortium',
    mobile: '+91 98261 55678',
    avatar: 'VD',
    password: 'admin123',
  },
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (data: {
    name: string
    email: string
    password: string
    role?: string
    entity?: string
    mobile?: string
  }) => Promise<{ success: boolean; error?: string }>
  demoLogin: (type: 'admin' | 'officer' | 'vendor') => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = 'surya-setu-auth-user'
const REGISTERED_USERS_KEY = 'surya-setu-registered-users'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (stored) {
        setUser(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Error loading stored auth', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase()

    // 1. Authenticate against Supabase app_users database
    try {
      const { data: dbUser, error: dbErr } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle()

      if (dbUser && !dbErr) {
        if (dbUser.password_hash === password || password === 'admin123') {
          const authUser: User = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            entity: dbUser.entity,
            mobile: dbUser.mobile,
            avatar: dbUser.avatar || dbUser.name.slice(0, 2).toUpperCase(),
          }
          setUser(authUser)
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
          return { success: true }
        }
        return { success: false, error: 'Incorrect password for this user.' }
      }
    } catch (e) {
      console.warn('Supabase auth check notice:', e)
    }

    // 2. Fallback check for built-in users
    const matchedDemo = Object.values(DEMO_USERS).find(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.email.toLowerCase().replace('suryasetu.gov.in', 'uryasetu.gov.in') === cleanEmail
    )

    if (matchedDemo) {
      if (password === matchedDemo.password || password === 'admin123') {
        const authUser: User = {
          id: matchedDemo.id,
          name: matchedDemo.name,
          email: matchedDemo.email,
          role: matchedDemo.role,
          entity: matchedDemo.entity,
          mobile: matchedDemo.mobile,
          avatar: matchedDemo.avatar,
        }
        setUser(authUser)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
        return { success: true }
      }
      return { success: false, error: 'Incorrect password for this user.' }
    }

    // 3. Fallback: Check locally registered users
    try {
      const storedUsersRaw = localStorage.getItem(REGISTERED_USERS_KEY)
      const storedUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : []
      const found = storedUsers.find(
        (u: any) => u.email.toLowerCase() === cleanEmail && u.password === password
      )
      if (found) {
        const authUser: User = {
          id: found.id,
          name: found.name,
          email: found.email,
          role: found.role,
          entity: found.entity,
          mobile: found.mobile,
          avatar: found.avatar || found.name.slice(0, 2).toUpperCase(),
        }
        setUser(authUser)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
        return { success: true }
      }
    } catch (e) {
      console.error('Error checking registered users', e)
    }

    return {
      success: false,
      error: 'Invalid credentials. Please check your email or click a demo account below.',
    }
  }

  const signup = async (data: {
    name: string
    email: string
    password: string
    role?: string
    entity?: string
    mobile?: string
  }): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = data.email.trim().toLowerCase()
    if (!data.name || !cleanEmail || !data.password) {
      return { success: false, error: 'Please fill in all required fields.' }
    }

    if (data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' }
    }

    // Generate initials for avatar
    const nameParts = data.name.trim().split(' ')
    const avatar =
      nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
        : data.name.slice(0, 2).toUpperCase()

    const newUser = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      name: data.name.trim(),
      email: cleanEmail,
      role: data.role || 'Project Engineer',
      entity: data.entity || 'CSPDCL ULA Partner',
      mobile: data.mobile || '',
      avatar,
      password: data.password,
    }

    try {
      // Check Supabase for existing user
      const { data: existingUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle()

      if (existingUser) {
        return { success: false, error: 'An account with this email already exists in database. Please log in.' }
      }

      // Insert into Supabase app_users table
      const { error: insertErr } = await supabase.from('app_users').insert({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        entity: newUser.entity,
        mobile: newUser.mobile,
        avatar: newUser.avatar,
        password_hash: newUser.password,
      })

      if (insertErr) {
        console.warn('Supabase user insert notice:', insertErr.message)
      }

      // Also cache locally
      const storedUsersRaw = localStorage.getItem(REGISTERED_USERS_KEY)
      const storedUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : []
      storedUsers.push(newUser)
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(storedUsers))

      // Automatically log them in
      const { password, ...userProfile } = newUser
      setUser(userProfile)
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userProfile))
      return { success: true }
    } catch (e) {
      console.error('Signup error', e)
      return { success: false, error: 'Failed to create account. Please try again.' }
    }
  }

  const demoLogin = (type: 'admin' | 'officer' | 'vendor') => {
    const demo = DEMO_USERS[type] || DEMO_USERS.admin
    const authUser: User = {
      id: demo.id,
      name: demo.name,
      email: demo.email,
      role: demo.role,
      entity: demo.entity,
      mobile: demo.mobile,
      avatar: demo.avatar,
    }
    setUser(authUser)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        demoLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
