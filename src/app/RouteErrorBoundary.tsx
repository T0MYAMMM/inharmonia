import { Component, type ReactNode } from 'react';
import { PageHeader } from '@/features/PageHeader';
import { Button } from '@/ui/Button';

interface Props {
  /** Changes when the page does, so the next page gets a fresh try. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
  key: string;
}

/**
 * Catches a page that fails to render, most often because its code didn't
 * load (offline, or a deploy replaced it), and offers a reload in its place.
 * The header and footer stay.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert">
        <PageHeader
          title="This page didn't load."
          lede="Check your connection, then reload."
          actions={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    );
  }
}
