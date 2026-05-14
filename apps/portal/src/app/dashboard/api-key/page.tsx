import { MasterDataPagePlaceholder } from '@/components/master-data-placeholder';

export default function ApiKeyPage() {
  return (
    <MasterDataPagePlaceholder
      title="API Keys"
      description="Kelola API key untuk aplikasi konsumen (per sinode)."
      resource="sinode-api-key"
    />
  );
}
