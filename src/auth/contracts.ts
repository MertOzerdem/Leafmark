export interface AuthIdentity {
  subject: string;
  username: string;
}

export interface AuthSession {
  isLoaded: boolean;
  identity: AuthIdentity | null;
}

export interface AuthActions {
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface ReaderProfile {
  subject: string;
  username: string;
  privateLabel: string;
}

export interface ReaderProfileRepository {
  loadOrCreate(identity: AuthIdentity): Promise<ReaderProfile>;
}
