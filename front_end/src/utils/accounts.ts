// Custom error class for wrong credentials
export class WrongCredentialError extends Error {
  constructor(message: string = 'Wrong Credential') {
    super(message);
    this.name = 'WrongCredentialError';
  }
}

export class RefreshError extends Error {
  constructor(message: string = 'Refresh Error') {
    super(message);
    this.name = 'RefreshError';
  }
}

export interface Server {
  id: number;
  name: string;
  value: string;
}

export interface RiskSetting {
  id: number;
  name: string;
  value: string;
}

export interface Account {
  account_id: string;
  login: string;
  password: string;
  server: string;
  groupid: string;
  state: string;
  status: number; // 1 for active, 0 for paused
  balance: number;
  name: string;
}

export interface AccountActivity {
  id: number;
  activity_type: string;
  details: {
    account_number: string;
    current_balance: number;
    configuration?: {
      server: string;
      groupid: string;
      subscription: string;
      environment: string;
    };
    previous_configuration?: {
      groupid: string;
      server: string;
      status: string;
    };
    new_configuration?: {
      groupid: string;
      server: string;
      status: string;
    };
    active_configuration?: {
      groupid: string;
      server: string;
      status: string;
      name: string;
    };
    action?: string;
    timestamp: string;
  };
  created_at: string;
}

export interface AccountSettings {
  servers: Server[];
  enabledRiskSettings: RiskSetting[];
}

// API Functions
export const accountsApi = {
  // Check server status
  async checkServerStatus(): Promise<{ status: string; available: boolean; }> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new/accounts/api-status`);
    
    if (!response.ok) {
      throw new Error('Failed to check server status');
    }

    const data = await response.json();

    return {
      status: data.data.status,
      available: data.data.availability?.recommended_action === "direct" || false
    };
  },

  // Wait for server to be ready
  async waitForServerReady(maxAttempts: number = 200): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await this.checkServerStatus();
        
        if (status.available) {
          return; // Server is running
        }
        
        // If server is busy, wait 3 seconds before next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.warn(`Server status check attempt ${attempt} failed:`, error);
        
        // If it's not the last attempt, wait 3 seconds before retrying
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    throw new Error('Server is not ready after maximum attempts');
  },

  // Get account settings (servers and risk settings)
  async getSettings(token: string): Promise<AccountSettings> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      throw new Error('Failed to fetch settings');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch settings');
    }

    return data;
  },

  // Get user accounts by userId (slower endpoint)
  async getAccount(token: string, userId: number): Promise<Account> {
    try {
      const response = await fetch(`https://api.jamestradinggroup.com/api/detail/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired');
        }
        if (response.status === 500) {
          throw new Error('Invalid credentials - account connection failed');
        }
        throw new Error('Failed to fetch accounts');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch accounts');
      }

      return data.data || null;
    } catch (error: any) {
      // Re-throw the error so it can be caught by the calling code
      // CORS errors and network errors will be caught here
      throw error;
    }
  },

  // Get account by account_id (faster endpoint for login optimization)
  async getAccountById(token: string, accountId: string): Promise<Account | null> {
    try {
      const response = await fetch(`https://api.jamestradinggroup.com/api/detail/${accountId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired');
        }
        if (response.status === 404) {
          // Account not found, return null
          return null;
        }
        throw new Error('Failed to fetch account');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch account');
      }

      // API returns {success: true, account: {...}}, so return data.account
      return data.account || null;
    } catch (error: any) {
      // Re-throw the error so it can be caught by the calling code
      // CORS errors and network errors will be caught here
      throw error;
    }
  },

  // Create new account
  async createAccount(token: string, accountData: {
    user_id: number;
    type: number;
    login: string;
    password: string;
    server: string;
    groupid: string;
    subscription: string;
    email: string;
    platform_type: string;
    name: string;
  }): Promise<Account> {
    // Wait for server to be ready before connecting account
    // await this.waitForServerReady();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(accountData),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      } else if (response.status === 500) {
        const data = await response.json();
        if (data.message.includes('Method Not Allowed')) {
          throw new WrongCredentialError('Invalid credentials. Please check your login details.');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message.detail || 'Failed to create account');
      }
    }

    try {
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to create account');
      }
  
      return result.data;
    } catch(e) {
      throw new Error('A duplicate account already exists.');
    }
  },

  // Update account
  async updateAccount(token: string, accountData: {
    account_id: string;
    status: string;
    groupid?: string;
    email: string;
  }): Promise<Account> {
    const response = await fetch(`https://api.jamestradinggroup.com/api/accounts/${accountData.account_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        groupid: accountData.groupid,
        name: accountData.email,
        account_id: accountData.account_id,
        status: accountData.status,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update account');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update account');
    }

    return result.data;
  },

  // Delete account
  async deleteAccount(token: string, accountData: {
    account_id: string;
    login: string;
    email: string;
  }): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(accountData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete account');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to delete account');
    }
  },

  // Update user connected status
  async updateConnectedStatus(token: string, connected: boolean): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/connected`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ connected }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update connected status');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update connected status');
    }
  },

  // Pause account
  async pauseAccount(token: string, accountData: {
    account_id: string;
    login: string;
    email: string;
  }): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(accountData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to pause account');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to pause account');
    }
  },

  // Resume account
  async resumeAccount(token: string, accountData: {
    account_id: string;
    login: string;
    email: string;
  }): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(accountData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to resume account');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to resume account');
    }
  },

  // Get account creation status
  async getAccountCreationStatus(token: string, accountId: string): Promise<{
    success: boolean;
    status: string;
    message: string;
    progress: number;
    step: string;
    step_description: string;
    start_time: string;
    last_update: string;
    estimated_completion: string | null;
    steps_completed: string[];
  }> {
    const response = await fetch(`https://api.jamestradinggroup.com/api/detail/status/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      throw new Error('Failed to fetch account creation status');
    }

    const data = await response.json();
    return data;
  },

  // Get account activities
  async getAccountActivities(token: string): Promise<AccountActivity[]> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/account-activities`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Session expired');
      }
      throw new Error('Failed to fetch activities');
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch activities');
    }

    return data.data || [];
  },
};

// Utility functions
export const accountUtils = {
  // Get server name from server code
  getServerName(serverCode: string): string {
    const serverMap: { [key: string]: string } = {
      'T4Trade-Demo': 'T4Trade Demo',
      'T4Trade-Live': 'T4Trade Live',
      'IronFX-Demo': 'IronFX Demo',
      'IronFX-Live': 'IronFX Live',
    };
    return serverMap[serverCode] || serverCode;
  },

  // Get risk setting name from groupid
  getRiskSettingName(groupid: string): string {
    const riskMap: { [key: string]: string } = {
      'aXciiLZp': 'Low',
      'bXciiLZp': 'Medium',
      'tXciiLZp': 'High',
      'wVZiiLZp': 'PRO',
      'OJKiiLZp': 'PRO+',
      'LJKiiLZp': 'PRO++',
      'ppKiiLZp': 'PRO+++',
      // Legacy mappings for backward compatibility
      'EVZiiLZp': 'Low',
      'LZZiiLZp': 'High',
    };
    return riskMap[groupid] || groupid;
  },

  // Get activity type color
  getActivityTypeColor(type: string): string {
    const colors = {
      connected: 'bg-green-500',
      paused: 'bg-yellow-500',
      resumed: 'bg-blue-500',
      deleted: 'bg-red-500',
      config_changed: 'bg-purple-500',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500';
  },

  // Format activity type
  formatActivityType(type: string): string {
    if (type === 'config_changed') return 'Config Change';
    return type.charAt(0).toUpperCase() + type.slice(1);
  },
}; 