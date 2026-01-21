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
        <BackgroundComponent
            className={classNames(
                sizing.parentWidth,
                sizing.paddingL,
                flex.flexColumn,
                flex.flexGapM,
                flex.justifyContentCenter
            )}
        >
                {children}
        </BackgroundComponent>
    )
}