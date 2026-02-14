import {flex, sizing, template} from "utils-styles";

import './App.css'

import Background from "./components/background/background.tsx";
import { EtymologProvider } from "./db";
import { ProcessingLockModalProvider } from "cyber-components/graphics/loading/processingLockModal/processingLockModal";

import classNames from "classnames";
import RouterTabContainer, {tabContainerBorderStyle} from "cyber-components/container/tabContainer/routerTabContainer.tsx";
import LexiconMain from "./components/tabs/lexicon/main.tsx";
import GraphemeMain from "./components/tabs/grapheme/main.tsx";
import GraphotacticMain from "./components/tabs/graphotactic/main.tsx";
import TranslatorMain from "./components/tabs/translator/main.tsx";
import WritingSystemMain from "./components/tabs/writingSystem/main.tsx";

const sections = [
    {
        path: 'lexicon',
        toggle: 'Lexicon',
        content: <LexiconMain/>
    },
    {
        path: 'script-maker',
        toggle: 'Script Maker',
        content:
            <GraphemeMain/>
    },
    {
        path: 'writing-system',
        toggle: 'Writing System',
        content: <WritingSystemMain/>
    },
    {
        path: 'translator',
        toggle: 'Translator',
        content: <TranslatorMain/>
    }
];

function App() {
    return (
        <ProcessingLockModalProvider>
            <EtymologProvider>
                <Background>
                    <h1 className={classNames(template.primaryOutlineContainer, sizing.paddingS, sizing.parentWidth)}>
                        Threlogean
                    </h1>
                    <RouterTabContainer
                        className={classNames(sizing.parentSize, flex.flexGrow)}
                        basePath=""
                        contentContainerProps={{
                            className: classNames(tabContainerBorderStyle, sizing.paddingLHeight)
                        }}
                        sections={sections}
                    />
                    <div className={classNames(flex.flexRow, flex.justifyContentSpaceBetween)}>
                        <span>
                            Ethymolog: An open-source conlang lexicon and script management tool.
                        </span>

                        <span>
                            By Kerbash
                        </span>
                    </div>
                </Background>
            </EtymologProvider>
        </ProcessingLockModalProvider>
    )
}

export default App
