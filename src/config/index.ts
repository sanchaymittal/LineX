import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // Server Configuration
  port: number;
  nodeEnv: string;
  demoMode: boolean;
  
  // Redis Configuration
  redis: {
    url: string;
  };
  
  // Kaia Blockchain Configuration
  kaia: {
    rpcUrl: string;
    chainId: number;
    mockUsdtContractAddress: string;
    gasPayer: {
      privateKey: string;
    };
  };
  
  // Blockchain Configuration (for easier access)
  blockchain: {
    mockUsdtAddress: string;
    gasPayerPrivateKey: string;
  };
  
  // DappPortal Configuration
  dappPortal: {
    apiKey: string;
    webhookSecret: string;
  };
  
  // Security Configuration
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  // Webhook Configuration
  webhook: {
    ngrokUrl: string;
  };
  
  // Logging Configuration
  logging: {
    level: string;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  demoMode: process.env.DEMO_MODE === 'true',
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  kaia: {
    rpcUrl: process.env.KAIA_RPC_URL || 'https://public-en-kairos.node.kaia.io',
    chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001', 10),
    mockUsdtContractAddress: process.env.MOCK_USDT_CONTRACT_ADDRESS || '',
    gasPayer: {
      privateKey: process.env.GAS_PAYER_PRIVATE_KEY || '',
    },
  },
  
  blockchain: {
    mockUsdtAddress: process.env.MOCK_USDT_CONTRACT_ADDRESS || '',
    gasPayerPrivateKey: process.env.GAS_PAYER_PRIVATE_KEY || '',
  },
  
  dappPortal: {
    apiKey: process.env.DAPPPORTAL_API_KEY || '',
    webhookSecret: process.env.DAPPPORTAL_WEBHOOK_SECRET || '',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key',
    expiresIn: '12h',
  },
  
  webhook: {
    ngrokUrl: process.env.NGROK_URL || '',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validation function
export function validateConfig(): void {
  const requiredFields = [
    'jwt.secret',
  ];
  
  const missingFields: string[] = [];
  
  requiredFields.forEach(field => {
    const value = getNestedValue(config, field);
    if (!value || value === 'fallback-secret-key') {
      missingFields.push(field);
    }
  });
  
  if (missingFields.length > 0) {
    console.warn('Missing required configuration fields:', missingFields);
    if (config.nodeEnv === 'production') {
      throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
    }
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export default config;