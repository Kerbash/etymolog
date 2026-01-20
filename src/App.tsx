import {flex, sizing, template} from "utils-styles";

import './App.css'

import Background from "./components/background/background.tsx";

import classNames from "classnames";
import TabContainer, {tabContainerBorderStyle} from "cyber-components/container/tabContainer/tabContainer.tsx";

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
                    className: classNames(tabContainerBorderStyle, sizing.paddingM, flex.flexGrow)
                }}
                sections={[
                    {
                        id: 'lexicon',
                        toggle: 'Lexicon',
                        content:
                            <div>
                                Etymology Content
                            </div>
                    },
                    {
                        id: 'part-of-speech',
                        toggle: 'Part of Speech',
                        content:
                            <div>
                                Dictionary Content
                            </div>
                    }
                ]}
            />
        </Background>
    )
}

export default App
