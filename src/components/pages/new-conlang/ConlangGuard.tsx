import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useEtymologSettings } from '../../../db';

interface ConlangGuardProps {
    children: ReactNode;
}

export default function ConlangGuard({ children }: ConlangGuardProps) {
    const { settings } = useEtymologSettings();

    if (!settings.conlangName) {
        return <Navigate to="/new" replace />;
    }

    return <>{children}</>;
}
