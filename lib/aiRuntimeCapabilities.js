function has(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getAIRuntimeCapabilities() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';

  return {
    database: {
      provider: 'supabase',
      enabled: has(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && has(process.env.SUPABASE_SERVICE_ROLE_KEY),
      auth: true,
      storage: true,
      notes: 'Primary source of truth for users, plans, tasks, events, memory, memberships, and profile data.',
    },
    ai: {
      provider: 'openai',
      enabled: has(process.env.OPENAI_API_KEY),
      model_runtime: 'responses_api',
      file_search_runtime: false,
      notes:
        'Agents run via OpenAI Responses API. Retrieval/file-search is not wired at runtime yet, so agents must not pretend they accessed external documents unless those documents were already passed through context.',
    },
    enrichment: {
      spoonacular: {
        enabled: has(process.env.SPOONACULAR_API_KEY) || has(process.env.RAPIDAPI_KEY),
        purpose: 'Meal metadata, nutrition hints, recipe imagery',
      },
      pexels: {
        enabled: has(process.env.PEXELS_API_KEY),
        purpose: 'Fallback food images',
      },
      exercisedb: {
        enabled: (has(process.env.EXERCISEDB_API_KEY) || has(process.env.RAPIDAPI_KEY)) && has(process.env.EXERCISEDB_API_HOST),
        purpose: 'Exercise GIFs and exercise metadata',
      },
    },
    delivery: {
      email: {
        enabled: has(process.env.GMAIL_USER) && has(process.env.GMAIL_APP_PASSWORD),
        from: has(process.env.EMAIL_FROM) ? process.env.EMAIL_FROM : null,
        purpose: 'Plan emails and user communication',
      },
      calendar: {
        enabled: has(process.env.GOOGLE_CALENDAR_CLIENT_ID) && has(process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
        trainer_email: has(process.env.TRAINER_EMAIL) ? process.env.TRAINER_EMAIL : null,
        purpose: 'Trainer calendar sync and scheduling flows',
      },
      cron: {
        enabled: has(process.env.CRON_SECRET),
        purpose: 'Protected scheduled jobs',
      },
    },
    billing: {
      stripe: {
        enabled:
          has(process.env.STRIPE_SECRET_KEY) &&
          has(process.env.STRIPE_WEBHOOK_SECRET) &&
          has(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) &&
          has(process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID),
        purpose: 'Checkout, pricing table, memberships, and webhook-driven billing state',
      },
    },
    app: {
      public_url: appUrl,
      admin_token_enabled: has(process.env.ADMIN_TOKEN),
    },
  };
}
