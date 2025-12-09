import { useLastFmStatus, useLastFmConnect, useLastFmDisconnect } from '@/hooks/useLastFm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Check, X, AlertCircle } from 'lucide-react';

export function SettingsPage() {
  const { data: status, isLoading, error } = useLastFmStatus();
  const connectMutation = useLastFmConnect();
  const disconnectMutation = useLastFmDisconnect();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LastFmLogo className="w-5 h-5" />
            Last.fm Scrobbling
          </CardTitle>
          <CardDescription>
            Connect your Last.fm account to automatically scrobble tracks as you listen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-32" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to load Last.fm status</span>
            </div>
          ) : !status?.configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                <span>Last.fm is not configured on the server</span>
              </div>
              <p className="text-sm text-muted-foreground">
                To enable scrobbling, set <code className="bg-muted px-1 rounded">LASTFM_API_KEY</code> and{' '}
                <code className="bg-muted px-1 rounded">LASTFM_API_SECRET</code> in your backend .env file.
              </p>
            </div>
          ) : status.authenticated ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <Check className="w-4 h-4" />
                <span>Connected as <strong>{status.username}</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href={`https://www.last.fm/user/${status.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Profile
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Tracks will be scrobbled after you listen to at least 50% of each track (or 4 minutes).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <X className="w-4 h-4" />
                <span>Not connected</span>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Connecting...' : 'Connect to Last.fm'}
              </Button>
              <p className="text-sm text-muted-foreground">
                You'll be redirected to Last.fm to authorize access.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LastFmLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M10.584 17.209l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.932l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.594 0-.935.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.602l1.87.44c1.402.33 1.869.825 1.869 1.704 0 1.016-.99 1.43-2.86 1.43-2.776 0-3.932-1.457-4.59-3.464l-.907-2.749c-1.155-3.574-2.997-4.894-6.653-4.894C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z" />
    </svg>
  );
}
