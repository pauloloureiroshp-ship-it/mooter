interface UserProfile {
  hardware_tier: string;
  subscriptions: string[];
  github_primary_language?: string;
  experience_level?: string;
  prompts_per_day_estimate?: number;
  monthly_budget_usd?: number;
}

type BudgetTier = 'free' | 'light' | 'moderate' | 'serious' | 'unlimited';

interface FrugalConfig {
  default_mode: 'auto' | 'zen' | 'beast';
  t0_threshold: number;
  t1_enabled: boolean;
  ollama_enabled: boolean;
  ollama_model: string;
  hub_push_enabled: boolean;
  suggested_install_command: string;
  personalized_message: string;
  monthly_budget_usd: number;
  budget_tier: BudgetTier;
}

function toBudgetTier(budget: number): BudgetTier {
  if (budget === 0) return 'free';
  if (budget <= 10) return 'light';
  if (budget <= 50) return 'moderate';
  if (budget <= 150) return 'serious';
  return 'unlimited';
}

export function generateFrugalConfig(profile: UserProfile): FrugalConfig {
  const hasClaude = profile.subscriptions.includes('claude_max') ||
                    profile.subscriptions.includes('claude_api');
  const hasGPT = profile.subscriptions.includes('gpt_plus') ||
                 profile.subscriptions.includes('gpt_api');
  const isMac = profile.hardware_tier === 'mac_m_series';
  const isWindows = profile.hardware_tier.startsWith('windows_');
  const hasGPU = profile.hardware_tier.includes('nvidia') || isMac;

  const budget = profile.monthly_budget_usd ?? 30;
  const budgetTier = toBudgetTier(budget);

  const config: FrugalConfig = {
    default_mode: budgetTier === 'free' ? 'zen' : 'auto',
    t0_threshold: 0.85,
    t1_enabled: budgetTier !== 'free',
    ollama_enabled: hasGPU,
    ollama_model: 'qwen2.5:3b',
    hub_push_enabled: true,
    suggested_install_command: isWindows
      ? 'irm https://mooter.ai/install.ps1 | iex'
      : 'bash <(curl -fsSL https://mooter.ai/install.sh)',
    personalized_message: '',
    monthly_budget_usd: budget,
    budget_tier: budgetTier,
  };

  if (profile.github_primary_language === 'Python') {
    config.t0_threshold = 0.80;
  }

  if (profile.experience_level === 'beginner') {
    config.personalized_message = 'Your frugal has been configured for your setup. Everything works automatically.';
  } else if (profile.experience_level === 'advanced') {
    config.t0_threshold = 0.90;
    config.personalized_message = 'Config optimized for your profile. /frugal-beast when you need full power.';
  }

  return config;
}
