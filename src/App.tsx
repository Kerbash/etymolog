import {sizing, template} from "utils-styles";

import './App.css'

import Background from "./components/background/background.tsx";

import classNames from "classnames";
import TabContainer, {tabContainerBorderStyle} from "cyber-components/container/tabContainer/tabContainer.tsx";
import LexiconMain from "./components/tabs/lexicon/main.tsx";
import LogogramMain from "./components/tabs/logogram/main.tsx";
import GraphotacticMain from "./components/tabs/graphotactic/main.tsx";

function App() {
    return (
        <Background>
            <h1 className={classNames(template.primaryOutlineContainer, sizing.paddingS, sizing.parentWidth)}>
                Threlogean
            </h1>
            <TabContainer
                className={classNames(sizing.parentSize)}
                id={'tabs'}
                contentContainerProps={{
                    className: classNames(tabContainerBorderStyle, sizing.paddingM)
                }}
                sections={[
                    {
                        id: 'lexicon',
                        toggle: 'Lexicon',
                        content: <LexiconMain/>
                    },
                    {
                        id: 'part-of-speech',
                        toggle: 'Part of Speech',
                        content:
                            <div>
                                Dictionary Content
                            </div>
                    },
                    {
                        id: 'script-maker',
                        toggle: 'Script Maker',
                        content:
                            <LogogramMain/>
                    },
                    {
                        id: 'graphotactic',
                        toggle: 'Graphotactic',
                        content:
                            <GraphotacticMain/>
                    }
                ]}
            />
        </Background>
    )
}

export default App
