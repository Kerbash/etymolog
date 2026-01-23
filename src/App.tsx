import {flex, sizing, template} from "utils-styles";

import './App.css'

import Background from "./components/background/background.tsx";
import { EtymologProvider } from "./db";

import classNames from "classnames";
import RouterTabContainer, {tabContainerBorderStyle} from "cyber-components/container/tabContainer/routerTabContainer.tsx";
import LexiconMain from "./components/tabs/lexicon/main.tsx";
import GraphemeMain from "./components/tabs/grapheme/main.tsx";
import GraphotacticMain from "./components/tabs/graphotactic/main.tsx";

const sections = [
    {
        path: 'lexicon',
        toggle: 'Lexicon',
        content: <LexiconMain/>
    },
    {
        path: 'part-of-speech',
        toggle: 'Part of Speech',
        content:
            <div>
                Dictionary Content
            </div>
    },
    {
        path: 'script-maker',
        toggle: 'Script Maker',
        content:
            <GraphemeMain/>
    },
    {
        path: 'graphotactic',
        toggle: 'Graphotactic',
        content:
            <GraphotacticMain/>
    }
];

function App() {
    return (
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
    )
}

export default App
