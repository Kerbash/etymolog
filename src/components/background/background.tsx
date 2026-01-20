import {flex, sizing} from "utils-styles";

import React from "react";
import classNames from "classnames";

import BackgroundComponent from "cyber-components/layout/backgroundComponent/backgroundComponent.tsx";

type BackgroundProps = {
    children?: React.ReactNode;
}

export default function Background({
                                       children
                                   }: BackgroundProps) {
    return (
        <BackgroundComponent style={{
            width: "100dvw",
            height: "100dvh",
        }}
            innerClassName={classNames(sizing.paddingL, flex.flexColumn, flex.flexGapM)}
        >
            {children}
        </BackgroundComponent>
    )
}