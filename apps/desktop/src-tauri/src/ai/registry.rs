use std::sync::Arc;
use tokio::sync::RwLock;

use super::{AiProvider, AiProviderInfo};

type ProviderFactory = Arc<dyn Fn() -> Box<dyn AiProvider> + Send + Sync>;

struct RegisteredProvider {
    factory: ProviderFactory,
    info: AiProviderInfo,
}

pub struct ProviderRegistry {
    providers: Vec<RegisteredProvider>,
    active: RwLock<Option<String>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            active: RwLock::new(None),
        }
    }

    pub fn register(
        &mut self,
        factory: impl Fn() -> Box<dyn AiProvider> + Send + Sync + 'static,
        info: AiProviderInfo,
    ) {
        self.providers.push(RegisteredProvider {
            factory: Arc::new(factory),
            info,
        });
    }

    pub fn list_providers(&self) -> Vec<AiProviderInfo> {
        self.providers.iter().map(|p| p.info.clone()).collect()
    }

    #[allow(dead_code)]
    pub fn get_provider_info(&self, id: &str) -> Option<AiProviderInfo> {
        self.providers
            .iter()
            .find(|p| p.info.id == id)
            .map(|p| p.info.clone())
    }

    pub fn create_provider(&self, id: &str) -> Option<Box<dyn AiProvider>> {
        self.providers
            .iter()
            .find(|p| p.info.id == id)
            .map(|p| (p.factory)())
    }

    pub async fn active_id(&self) -> Option<String> {
        self.active.read().await.clone()
    }

    pub async fn set_active(&self, id: Option<String>) {
        *self.active.write().await = id;
    }
}
