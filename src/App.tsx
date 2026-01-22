import {sizing, template} from "utils-styles";

import './App.css'

import Background from "./components/background/background.tsx";

import classNames from "classnames";
import RouterTabContainer, {tabContainerBorderStyle} from "cyber-components/container/tabContainer/routerTabContainer.tsx";
import LexiconMain from "./components/tabs/lexicon/main.tsx";
import LogogramMain from "./components/tabs/logogram/main.tsx";
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
            <LogogramMain/>
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
        <Background>
            <h1 className={classNames(template.primaryOutlineContainer, sizing.paddingS, sizing.parentWidth)}>
                Threlogean
            </h1>
            <RouterTabContainer
                className={classNames(sizing.parentSize)}
                basePath=""
                contentContainerProps={{
                    className: classNames(tabContainerBorderStyle, sizing.paddingM)
                }}
                sections={sections}
            />
        </Background>
    )
}

export default App
