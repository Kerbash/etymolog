import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { flex } from 'utils-styles';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import Background from '../../background/background.tsx';
import ConlangNameModal from './ConlangNameModal.tsx';
import { ImportButton } from '../../exportImport/ExportImportButtons.tsx';
import { useEtymologSettings } from '../../../db';

export default function NewConlangPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { settings, updateSettings } = useEtymologSettings();
    const navigate = useNavigate();

    const handleNameSubmit = (name: string) => {
        updateSettings({ conlangName: name });
        navigate('/lexicon');
    };

    const hasConlang = settings.conlangName.trim().length > 0;

    return (
        <Background>
            <div
                className={classNames(flex.flexColumn, flex.alignItemsCenter)}
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    minHeight: '60vh',
                }}
            >
                <div className={classNames(flex.flexColumn, flex.alignItemsCenter, flex.flexGapL)}>
                    <div className={classNames(flex.flexColumn, flex.alignItemsCenter, flex.flexGapS)}>
                        <h1 style={{ fontSize: '2.5rem', margin: 0 }}>Etymolog</h1>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            Conlang lexicon and script management
                        </p>
                    </div>

                    <div className={classNames(flex.flexColumn, flex.alignItemsCenter, flex.flexGapM)}>
                        <div className={classNames(flex.flexRow, flex.flexGapM, flex.alignItemsCenter)}>
                            <Button
                                className={buttonStyles.primary}
                                onClick={() => setIsModalOpen(true)}
                            >
                                New Conlang
                            </Button>
                            <ImportButton onSuccess={() => navigate('/lexicon')} />
                        </div>

                        {hasConlang && (
                            <>
                                <div className={classNames(flex.flexColumn, flex.alignItemsCenter, flex.flexGapS)}>
                                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.875rem' }}>
                                        Currently loaded:
                                    </p>
                                    <p style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.25rem', fontWeight: 500 }}>
                                        {settings.conlangName}
                                    </p>
                                </div>
                                <Button
                                    className={buttonStyles.secondary}
                                    onClick={() => navigate('/lexicon')}
                                >
                                    Go to Conlang
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <ConlangNameModal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                onSubmit={handleNameSubmit}
            />
        </Background>
    );
}
